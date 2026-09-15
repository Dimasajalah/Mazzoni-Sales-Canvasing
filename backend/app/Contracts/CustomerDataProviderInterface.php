<?php

namespace App\Contracts;

use App\Models\Customer;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

interface CustomerDataProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 50): LengthAwarePaginator;

    public function find(int $id): ?Customer;

    public function allActive(): Collection;
}
