<?php

namespace App\Services;

use App\Providers\Data\Contracts\InventoryDataProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class InventoryService
{
    public function __construct(private readonly InventoryDataProviderInterface $provider)
    {
    }

    public function list(array $filters = [], int $perPage = 50): LengthAwarePaginator
    {
        return $this->provider->list($filters, $perPage);
    }

    public function byProduct(int $productId): Collection
    {
        return $this->provider->byProduct($productId);
    }
}
