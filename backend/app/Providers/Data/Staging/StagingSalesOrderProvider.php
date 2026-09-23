<?php
// backend/app/Providers/Data/Staging/StagingSalesOrderProvider.php

namespace App\Providers\Data\Staging;

use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Providers\Data\Contracts\SalesOrderProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StagingSalesOrderProvider implements SalesOrderProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = SalesOrder::query()->with(['customer', 'salesperson', 'lines.product']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['customer_id'])) {
            $query->where('customer_id', $filters['customer_id']);
        }

        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        if (! empty($filters['q'])) {
            $q = $filters['q'];
            $query->where(function ($builder) use ($q) {
                $builder->where('order_number', 'like', "%{$q}%")
                    ->orWhere('customer_po', 'like', "%{$q}%");
            });
        }

        return $query->latest('order_date')->paginate($perPage);
    }

    public function find(int $id): ?SalesOrder
    {
        return SalesOrder::with(['customer', 'salesperson', 'lines.product', 'shipments.lines', 'invoices'])->find($id);
    }

    public function create(array $header, array $lines): SalesOrder
    {
        if (empty($lines)) {
            throw ValidationException::withMessages(['lines' => ['At least one order line is required.']]);
        }

        return DB::transaction(function () use ($header, $lines) {
            $subtotal = 0;
            $normalized = [];

            foreach ($lines as $line) {
                $isCustom = (bool) ($line['is_custom'] ?? false);
                $qty = (float) $line['qty'];
                $discount = (float) ($line['discount'] ?? 0);

                if ($isCustom) {
                    $unitPrice = (float) ($line['unit_price'] ?? 0);
                    $lineTotal = max(0, ($qty * $unitPrice) - $discount);
                    $subtotal += $lineTotal;

                    $normalized[] = [
                        'product_id' => null,
                        'is_custom' => true,
                        'custom_part_name' => $line['custom_part_name'],
                        'qty' => $qty,
                        'uom' => $line['uom'] ?? 'PCS',
                        'unit_price' => $unitPrice,
                        'discount' => $discount,
                        'line_total' => $lineTotal,
                    ];

                    continue;
                }

                $product = Product::findOrFail($line['product_id']);
                $unitPrice = isset($line['unit_price']) ? (float) $line['unit_price'] : (float) $product->price;
                $lineTotal = max(0, ($qty * $unitPrice) - $discount);
                $subtotal += $lineTotal;

                $normalized[] = [
                    'product_id' => $product->id,
                    'is_custom' => false,
                    'custom_part_name' => null,
                    'qty' => $qty,
                    'uom' => $line['uom'] ?? $product->uom,
                    'unit_price' => $unitPrice,
                    'discount' => $discount,
                    'line_total' => $lineTotal,
                ];
            }

            $discount = (float) ($header['discount'] ?? 0);
            $total = max(0, $subtotal - $discount);

            // Cek status Credit Hold customer — kalau hold, order otomatis berstatus HOLD
            // terlepas dari status yang diminta caller, supaya tidak bisa diloloskan diam-diam.
            $customer = Customer::find($header['customer_id']);
            $customerOnHold = (bool) ($customer?->credit_hold ?? false);
            $status = $customerOnHold ? 'HOLD' : ($header['status'] ?? 'CONFIRMED');

            $order = SalesOrder::create([
                ...$header,
                'subtotal' => $subtotal,
                'discount' => $discount,
                'total' => $total,
                'status' => $status,
                'sync_status' => $header['sync_status'] ?? 'NOT_REQUIRED',
                'notes' => $customerOnHold
                    ? trim(($header['notes'] ?? '')."\n[SYSTEM] Order otomatis di-hold: customer dalam status Credit Hold.")
                    : ($header['notes'] ?? null),
            ]);

            foreach ($normalized as $line) {
                SalesOrderLine::create([
                    'order_id' => $order->id,
                    ...$line,
                ]);
            }

            if (! empty($header['lead_id'])) {
                \App\Models\Lead::where('id', $header['lead_id'])->update(['stage' => 'WON']);
            }

            return $order->load(['customer', 'salesperson', 'lines.product']);
        });
    }

    public function tracker(int $id): ?array
    {
        $order = $this->find($id);
        if (! $order) {
            return null;
        }

        return [
            'order' => $order,
            'shipments' => $order->shipments,
            'invoices' => $order->invoices,
            'timeline' => [
                ['step' => 'ORDER', 'status' => $order->status, 'at' => $order->order_date],
                ['step' => 'SHIPMENT', 'status' => $order->shipments->first()?->status, 'at' => $order->shipments->first()?->ship_date],
                ['step' => 'INVOICE', 'status' => $order->invoices->first()?->status, 'at' => $order->invoices->first()?->invoice_date],
                ['step' => 'PAYMENT', 'status' => $order->invoices->first()?->balance <= 0 ? 'PAID' : 'OPEN', 'at' => null],
            ],
        ];
    }
}