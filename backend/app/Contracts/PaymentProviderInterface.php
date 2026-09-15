<?php

namespace App\Contracts;

use App\Models\Payment;

interface PaymentProviderInterface
{
    public function create(array $data): Payment;

    public function list(?int $customerId = null): iterable;
}
