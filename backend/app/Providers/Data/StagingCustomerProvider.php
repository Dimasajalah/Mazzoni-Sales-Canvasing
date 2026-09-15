<?php

namespace App\Providers\Data;

use App\Contracts\CustomerDataProviderInterface;
use App\Models\Customer;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class StagingCustomerProvider implements CustomerDataProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 50): LengthAwarePaginator
    {
        $q = Customer::query()->with('salesperson')->where('active', true);

        if (! empty($filters['salesperson_id'])) {
            $q->where('salesperson_id', $filters['salesperson_id']);
        }
        if (! empty($filters['q'])) {
            $term = '%'.$filters['q'].'%';
            $q->where(function ($w) use ($term) {
                $w->where('name', 'like', $term)
                    ->orWhere('customer_code', 'like', $term)
                    ->orWhere('city', 'like', $term);
            });
        }

        return $q->orderBy('name')->paginate($perPage);
    }

    public function find(int $id): ?Customer
    {
        return Customer::with(['salesperson', 'invoices', 'visits'])->find($id);
    }

    public function allActive(): Collection
    {
        return Customer::where('active', true)->orderBy('name')->get();
    }
}
