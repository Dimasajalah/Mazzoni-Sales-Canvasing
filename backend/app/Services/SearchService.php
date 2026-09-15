<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Product;
use App\Models\SalesOrder;

class SearchService
{
    public function search(string $q, int $limit = 10): array
    {
        $q = trim($q);
        if ($q === '') {
            return [
                'customers' => [],
                'leads' => [],
                'products' => [],
                'orders' => [],
                'invoices' => [],
            ];
        }

        return [
            'customers' => Customer::query()
                ->where(function ($builder) use ($q) {
                    $builder->where('name', 'like', "%{$q}%")
                        ->orWhere('customer_code', 'like', "%{$q}%");
                })
                ->limit($limit)
                ->get(['id', 'customer_code', 'name', 'city']),
            'leads' => Lead::query()
                ->where(function ($builder) use ($q) {
                    $builder->where('business_name', 'like', "%{$q}%")
                        ->orWhere('owner_name', 'like', "%{$q}%")
                        ->orWhere('phone', 'like', "%{$q}%");
                })
                ->limit($limit)
                ->get(['id', 'business_name', 'owner_name', 'stage']),
            'products' => Product::query()
                ->where(function ($builder) use ($q) {
                    $builder->where('part_num', 'like', "%{$q}%")
                        ->orWhere('description', 'like', "%{$q}%");
                })
                ->limit($limit)
                ->get(['id', 'part_num', 'description', 'price']),
            'orders' => SalesOrder::query()
                ->where('order_number', 'like', "%{$q}%")
                ->limit($limit)
                ->get(['id', 'order_number', 'customer_id', 'total', 'status']),
            'invoices' => Invoice::query()
                ->where('invoice_number', 'like', "%{$q}%")
                ->limit($limit)
                ->get(['id', 'invoice_number', 'customer_id', 'balance', 'status']),
        ];
    }
}
