<?php

namespace App\Providers\Data\Contracts;

use App\Models\SalesOrder;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface SalesOrderProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 20): LengthAwarePaginator;

    public function find(int $id): ?SalesOrder;

    public function create(array $header, array $lines): SalesOrder;

    public function tracker(int $id): ?array;
}
