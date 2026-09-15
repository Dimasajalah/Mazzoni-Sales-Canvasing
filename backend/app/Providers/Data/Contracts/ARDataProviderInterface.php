<?php

namespace App\Providers\Data\Contracts;

use App\Models\Invoice;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

interface ARDataProviderInterface
{
    public function invoices(array $filters = [], int $perPage = 20): LengthAwarePaginator;

    public function findInvoice(int $id): ?Invoice;

    public function agingSummary(?int $customerId = null): array;

    public function agingInvoices(?int $customerId = null, ?string $bucket = null): Collection;
}
