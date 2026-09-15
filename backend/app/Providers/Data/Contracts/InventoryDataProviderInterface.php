<?php

namespace App\Providers\Data\Contracts;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

interface InventoryDataProviderInterface
{
    public function list(array $filters = [], int $perPage = 50): LengthAwarePaginator;

    public function byProduct(int $productId): Collection;

    public function search(string $query, int $limit = 50): Collection;
}
