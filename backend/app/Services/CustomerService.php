<?php
//backend/app/Services/CustomerService.php
namespace App\Services;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadTask;
use App\Models\ProductSample;
use App\Models\User;
use App\Models\Visit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Providers\Data\Contracts\CustomerDataProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class CustomerService
{
    /** true = lead asal customer (dan tugas terbukanya) ikut pindah PIC; NOO yang tercatat ikut pindah. */
    private const DELEGATE_PIC_MOVES_LEADS = true;
    public function __construct(
        private readonly CustomerDataProviderInterface $provider,
        private readonly AuditLogService $auditLogService
    ) {
    }

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        return $this->provider->paginate($filters, $perPage);
    }

    public function find(int $id): ?Customer
    {
        return $this->provider->find($id);
    }

    /**
     * Log aktivitas customer (dokumen hal. 18): check-in/out, tugas selesai, perubahan pipeline, sample.
     * Mencakup jejak lead asal customer ini (leads.customer_id). Terbaru dulu.
     *
     * @return array{total: int, items: list<array<string, mixed>>}
     */
    public function activityLog(Customer $customer, int $limit = 10): array
    {
        $leadIds = Lead::where('customer_id', $customer->id)->pluck('id');
        $entries = collect();
        $push = function (string $kind, int $rank, string $title, ?string $subtitle, $at) use ($entries): void {
            if (! $at) {
                return;
            }
            $entries->push([
                'kind' => $kind, 'rank' => $rank, 'title' => $title, 'subtitle' => $subtitle,
                'at' => $at->toIso8601String(), 'ts' => $at->getTimestamp(),
            ]);
        };

        $visits = Visit::query()
            ->where(function ($q) use ($customer, $leadIds) {
                $q->where('customer_id', $customer->id);
                if ($leadIds->isNotEmpty()) {
                    $q->orWhereIn('lead_id', $leadIds);
                }
            })
            ->get();

        foreach ($visits as $v) {
            $near = $v->checkin_distance !== null
                ? ' · '.number_format((float) $v->checkin_distance, 0, ',', '.').' m from store'
                : '';
            $push('checkin', 1, 'Check-in', ($v->checkin_photo_path ? 'Store photo & GPS recorded' : 'GPS recorded').$near, $v->checkin_at);
            if ($v->checkout_at) {
                $push(
                    'checkout', 5, 'Check-out',
                    'Visit completed at '.$customer->name.($v->visit_result ? ' · '.$v->visit_result : ''),
                    $v->checkout_at
                );
            }
        }

        if ($leadIds->isNotEmpty()) {
            foreach (LeadTask::whereIn('lead_id', $leadIds)->where('status', LeadTask::DONE)->get() as $t) {
                $parts = array_filter([$t->conclusion, $t->reason_code, $t->task_status]);
                $detail = trim(implode(' · ', $parts).($t->remark ? ' — '.$t->remark : ''));
                $push('task', 4, $t->name, $detail !== '' ? $detail : null, $t->completed_at);
            }

            foreach (LeadActivity::whereIn('lead_id', $leadIds)->get() as $a) {
                $title = match ($a->activity_type) {
                    'WIN' => 'Win',
                    'LOSE' => 'Lose',
                    default => 'Pipeline updated',
                };
                $push('pipeline', 3, $title, $a->notes ?: ($a->from_stage.' → '.$a->to_stage), $a->created_at);
            }
        }

        $samples = ProductSample::query()
            ->where(function ($q) use ($customer, $leadIds) {
                $q->where('customer_id', $customer->id);
                if ($leadIds->isNotEmpty() && Schema::hasColumn('product_samples', 'lead_id')) {
                    $q->orWhereIn('lead_id', $leadIds);
                }
            })
            ->get();

        foreach ($samples as $s) {
            $status = $s->status === 'DELIVERED' ? 'Sudah diberikan' : 'Menunggu diberikan';
            $push('sample', 2, 'Sample', trim(($s->product_group ?: 'Sample').' · '.$s->qty.' gr · '.$status), $s->created_at);
        }

        // Urutan: waktu terbaru dulu; pada waktu yang sama, kejadian yang lebih akhir dalam alur tampil lebih atas.
        $sorted = $entries->sortByDesc(fn ($e) => $e['ts'] * 10 + $e['rank'])->values();

        return [
            'total' => $sorted->count(),
            'items' => $sorted->take($limit)
                ->map(fn ($e) => collect($e)->only(['kind', 'title', 'subtitle', 'at'])->all())
                ->values()
                ->all(),
        ];
    }

    /** Serah-terima PIC (dokumen hal. 20): mengganti Primary Salesperson customer. */
    public function delegatePic(Customer $customer, User $target, User $actor): Customer
    {
        return DB::transaction(function () use ($customer, $target, $actor) {
            $old = $customer->salesperson_id;
            $this->provider->update($customer, ['salesperson_id' => $target->id]);

            if (self::DELEGATE_PIC_MOVES_LEADS) {
                $leadIds = Lead::where('customer_id', $customer->id)->pluck('id');
                if ($leadIds->isNotEmpty()) {
                    Lead::whereIn('id', $leadIds)->update(['salesperson_id' => $target->id]);
                    LeadTask::whereIn('lead_id', $leadIds)
                        ->where('status', LeadTask::OPEN)
                        ->update(['assigned_to' => $target->id]);
                }
            }

            $this->auditLogService->log(
                $actor->id, 'customer.delegate_pic', Customer::class, $customer->id,
                ['salesperson_id' => $old], ['salesperson_id' => $target->id]
            );

            return $customer->fresh('salesperson');
        });
    }

    public function create(array $data, ?int $userId = null): Customer
    {
        $customer = $this->provider->create($data);
        $this->auditLogService->log($userId, 'customer.create', Customer::class, $customer->id, null, $customer->toArray());

        return $customer;
    }

    public function update(Customer $customer, array $data, ?int $userId = null): Customer
    {
        $old = $customer->toArray();
        $updated = $this->provider->update($customer, $data);
        $this->auditLogService->log($userId, 'customer.update', Customer::class, $updated->id, $old, $updated->toArray());

        return $updated;
    }

    public function delete(Customer $customer, ?int $userId = null): void
    {
        $this->auditLogService->log($userId, 'customer.delete', Customer::class, $customer->id, $customer->toArray());
        $customer->delete();
    }
}
