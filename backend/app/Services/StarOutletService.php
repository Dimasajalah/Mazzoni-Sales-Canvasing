<?php
namespace App\Services;

use App\Models\Customer;
use App\Models\StarOutlet;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Blueprint MJU 3.2.3 (MKT03): Marketing Staff menandai outlet sebagai Star Outlet aktif. */
class StarOutletService
{
    private const CUSTOMER_COLUMNS = 'customer:id,customer_code,name,city';

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function list(array $filters = []): Collection
    {
        $q = trim((string) ($filters['q'] ?? ''));

        return StarOutlet::query()
            ->with(self::CUSTOMER_COLUMNS)
            ->when(isset($filters['active']) && $filters['active'] !== '', fn ($x) => $x->where('active', filter_var($filters['active'], FILTER_VALIDATE_BOOLEAN)))
            ->when($q !== '', fn ($x) => $x->whereHas('customer', fn ($c) => $c->where('name', 'like', "%{$q}%")->orWhere('customer_code', 'like', "%{$q}%")))
            ->orderByDesc('active')->orderByDesc('activated_at')->orderByDesc('id')
            ->get();
    }

    /** Pencarian outlet (customer aktif) untuk form, lengkap dengan status Star Outlet-nya. */
    public function candidates(?string $q = null): Collection
    {
        $q = trim((string) $q);
        $customers = Customer::query()->where('active', true)
            ->when($q !== '', fn ($c) => $c->where(fn ($w) => $w->where('name', 'like', "%{$q}%")->orWhere('customer_code', 'like', "%{$q}%")))
            ->orderBy('name')->limit(20)->get(['id', 'customer_code', 'name', 'city']);

        $status = StarOutlet::whereIn('customer_id', $customers->pluck('id'))->pluck('active', 'customer_id');

        return $customers->map(fn ($c) => [
            'id' => $c->id, 'customer_code' => $c->customer_code, 'name' => $c->name, 'city' => $c->city,
            'star_status' => $status->has($c->id) ? ($status[$c->id] ? 'ACTIVE' : 'INACTIVE') : null,
        ])->values();
    }

    /** Mencentang Star Outlet Aktif. Outlet yang pernah dinonaktifkan diaktifkan lagi (satu baris per outlet). */
    public function activate(array $data, User $user): StarOutlet
    {
        $customer = Customer::findOrFail($data['customer_id']);
        if (! $customer->active) {
            throw ValidationException::withMessages(['customer_id' => 'Customer nonaktif tidak bisa dijadikan Star Outlet.']);
        }

        return DB::transaction(function () use ($customer, $data, $user) {
            $star = StarOutlet::where('customer_id', $customer->id)->lockForUpdate()->first();
            if ($star && $star->active) {
                throw ValidationException::withMessages(['customer_id' => 'Outlet ini sudah menjadi Star Outlet aktif.']);
            }

            $fields = [
                'active' => true, 'activated_at' => now(), 'deactivated_at' => null, 'activated_by' => $user->id,
                'requested_by' => $data['requested_by'] ?? null,
                'request_reference' => $data['request_reference'] ?? null,
                'notes' => $data['notes'] ?? null,
            ];
            $old = $star?->toArray();
            $star = $star ? tap($star)->update($fields) : StarOutlet::create(['customer_id' => $customer->id] + $fields);

            $this->auditLogService->log($user->id, 'star_outlet.activate', StarOutlet::class, $star->id, $old, $star->toArray());

            return $star->load(self::CUSTOMER_COLUMNS);
        });
    }

    public function update(StarOutlet $star, array $data, User $user): StarOutlet
    {
        $old = $star->toArray();
        $fields = array_intersect_key($data, array_flip(['requested_by', 'request_reference', 'notes']));
        $action = 'star_outlet.update';

        if (array_key_exists('active', $data) && (bool) $data['active'] !== $star->active) {
            if ($data['active']) {
                $fields += ['active' => true, 'activated_at' => now(), 'deactivated_at' => null, 'activated_by' => $user->id];
                $action = 'star_outlet.activate';
            } else {
                $fields += ['active' => false, 'deactivated_at' => now()];
                $action = 'star_outlet.deactivate';
            }
        }

        $star->update($fields);
        $this->auditLogService->log($user->id, $action, StarOutlet::class, $star->id, $old, $star->fresh()->toArray());

        return $star->fresh(self::CUSTOMER_COLUMNS);
    }

    public function find(int $id): ?StarOutlet
    {
        return StarOutlet::with(self::CUSTOMER_COLUMNS)->find($id);
    }
}