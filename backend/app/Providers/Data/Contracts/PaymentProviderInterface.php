<?php

namespace App\Providers\Data\Contracts;

use App\Models\Payment;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface PaymentProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 20): LengthAwarePaginator;

    public function create(array $data): Payment;
}
