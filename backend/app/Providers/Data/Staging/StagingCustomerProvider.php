<?php
//backend/app/Providers/Data/Staging/StagingCustomerProvider.php
namespace App\Providers\Data\Staging;

use App\Models\Customer;
use App\Providers\Data\Contracts\CustomerDataProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use App\Models\Visit;

class StagingCustomerProvider implements CustomerDataProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Customer::query()->with('salesperson');

        if (! empty($filters['q'])) {
            $q = $filters['q'];
            $query->where(function ($builder) use ($q) {
                $builder->where('name', 'like', "%{$q}%")
                    ->orWhere('customer_code', 'like', "%{$q}%")
                    ->orWhere('city', 'like', "%{$q}%");
            });
        }

        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        if (isset($filters['active'])) {
            $query->where('active', (bool) $filters['active']);
        }

        return $query->orderBy('name')->paginate($perPage);
    }

    public function find(int $id): ?Customer
    {
        $customer = Customer::with(['salesperson', 'invoices', 'samples' => fn ($q) => $q->latest('id')])->find($id);
        if (! $customer) {
            return null;
        }

        // Kunjungan yang dilakukan saat masih Lead (customer_id kosong) ikut dihitung ke customer
        // begitu lead itu menjadi customer (leads.customer_id terisi). Terbaru dulu.
        $visits = Visit::query()
            ->where(function ($q) use ($id) {
                $q->where('customer_id', $id)
                    ->orWhereHas('lead', fn ($l) => $l->where('customer_id', $id));
            })
            ->orderByDesc('checkin_at')
            ->get();
        $customer->setRelation('visits', $visits);

        return $customer;
    }

    public function create(array $data): Customer
    {
        return Customer::create($data);
    }

    public function update(Customer $customer, array $data): Customer
    {
        $customer->update($data);

        return $customer->fresh(['salesperson']);
    }

    public function search(string $query, int $limit = 20): Collection
    {
        return Customer::query()
            ->where(function ($builder) use ($query) {
                $builder->where('name', 'like', "%{$query}%")
                    ->orWhere('customer_code', 'like', "%{$query}%");
            })
            ->limit($limit)
            ->get();
    }
}
