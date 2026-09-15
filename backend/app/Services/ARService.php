<?php

namespace App\Services;

use App\Models\Invoice;
use App\Providers\Data\Contracts\ARDataProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class ARService
{
    public function __construct(private readonly ARDataProviderInterface $provider)
    {
    }

    public function invoices(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        return $this->provider->invoices($filters, $perPage);
    }

    public function findInvoice(int $id): ?Invoice
    {
        return $this->provider->findInvoice($id);
    }

    public function aging(?int $customerId = null, ?string $bucket = null): array
    {
        return [
            'summary' => $this->provider->agingSummary($customerId),
            'invoices' => $this->provider->agingInvoices($customerId, $bucket),
        ];
    }
}
