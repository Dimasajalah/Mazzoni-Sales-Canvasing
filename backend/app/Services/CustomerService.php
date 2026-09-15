<?php

namespace App\Services;

use App\Models\Customer;
use App\Providers\Data\Contracts\CustomerDataProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class CustomerService
{
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
