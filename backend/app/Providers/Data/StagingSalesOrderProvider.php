<?php

namespace App\Providers\Data;

use App\Contracts\SalesOrderProviderInterface;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Support\NumberGenerator;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class StagingSalesOrderProvider implements SalesOrderProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 50): LengthAwarePaginator
    {
        $q = SalesOrder::with(['customer', 'lines.product'])->latest('id');
        if (! empty($filters['salesperson_id'])) {
            $q->where('salesperson_id', $filters['salesperson_id']);
        }
        if (! empty($filters['customer_id'])) {
            $q->where('customer_id', $filters['customer_id']);
        }
        if (! empty($filters['status'])) {
            $q->where('status', $filters['status']);
        }

        return $q->paginate($perPage);
    }

    public function find(int $id): ?SalesOrder
    {
        return SalesOrder::with(['customer', 'lines.product', 'shipments.lines', 'invoices'])->find($id);
    }

    public function create(array $header, array $lines): SalesOrder
    {
        return DB::transaction(function () use ($header, $lines) {
            $header['order_number'] = NumberGenerator::next('SO-STG', 'sales_orders', 'order_number');
            $header['sync_status'] = $header['sync_status'] ?? 'NOT_REQUIRED';
            $order = SalesOrder::create($header);
            foreach ($lines as $line) {
                $line['order_id'] = $order->id;
                SalesOrderLine::create($line);
            }

            return $order->load(['customer', 'lines.product']);
        });
    }
}
