<?php

namespace App\Contracts;

use App\Models\SalesOrder;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface SalesOrderProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 50): LengthAwarePaginator;

    public function find(int $id): ?SalesOrder;

    public function create(array $header, array $lines): SalesOrder;
}
