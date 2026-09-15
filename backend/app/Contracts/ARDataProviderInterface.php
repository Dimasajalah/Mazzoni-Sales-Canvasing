<?php

namespace App\Contracts;

use Illuminate\Support\Collection;

interface ARDataProviderInterface
{
    public function portfolioSummary(?int $salespersonId = null): array;

    public function customerAging(int $customerId): array;

    public function openInvoices(?int $customerId = null): Collection;
}
