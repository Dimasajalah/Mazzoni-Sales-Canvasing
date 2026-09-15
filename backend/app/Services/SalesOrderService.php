<?php

namespace App\Services;

use App\Models\SalesOrder;
use App\Models\User;
use App\Providers\Data\Contracts\SalesOrderProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SalesOrderService
{
    public function __construct(
        private readonly SalesOrderProviderInterface $provider,
        private readonly AuditLogService $auditLogService
    ) {
    }

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        return $this->provider->paginate($filters, $perPage);
    }

    public function find(int $id): ?SalesOrder
    {
        return $this->provider->find($id);
    }

    public function create(array $header, array $lines, User $user): SalesOrder
    {
        if (! empty($header['client_uuid'])) {
            $existing = SalesOrder::where('client_uuid', $header['client_uuid'])->first();
            if ($existing) {
                return $existing->load(['customer', 'salesperson', 'lines.product']);
            }
        }

        $header['order_number'] = $header['order_number'] ?? $this->nextOrderNumber();
        $header['salesperson_id'] = $header['salesperson_id'] ?? $user->id;
        $header['order_date'] = $header['order_date'] ?? now()->toDateString();
        $header['client_uuid'] = $header['client_uuid'] ?? (string) Str::uuid();
        $header['sync_status'] = $header['sync_status'] ?? 'NOT_REQUIRED';

        $order = $this->provider->create($header, $lines);
        $this->auditLogService->log($user->id, 'order.create', SalesOrder::class, $order->id, null, $order->toArray());

        return $order;
    }

    public function tracker(int $id): ?array
    {
        return $this->provider->tracker($id);
    }

    public function nextOrderNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "SO-STG-{$year}-";

        return DB::transaction(function () use ($prefix) {
            $last = SalesOrder::where('order_number', 'like', $prefix.'%')
                ->lockForUpdate()
                ->orderByDesc('order_number')
                ->value('order_number');

            $seq = 1;
            if ($last && preg_match('/(\d+)$/', $last, $m)) {
                $seq = ((int) $m[1]) + 1;
            }

            return $prefix . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
        });
    }
}
