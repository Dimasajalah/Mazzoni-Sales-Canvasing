<?php

namespace App\Contracts;

use Illuminate\Support\Collection;

interface InventoryDataProviderInterface
{
    public function search(?string $q = null, ?string $warehouse = null): Collection;

    public function findByPartNum(string $partNum): ?array;
}
