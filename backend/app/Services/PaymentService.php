<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\User;
use App\Providers\Data\Contracts\PaymentProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class PaymentService
{
    public function __construct(
        private readonly PaymentProviderInterface $provider,
        private readonly AuditLogService $auditLogService
    ) {
    }

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        return $this->provider->paginate($filters, $perPage);
    }

    public function create(array $data, User $user): Payment
    {
        $data['salesperson_id'] = $data['salesperson_id'] ?? $user->id;
        $payment = $this->provider->create($data);
        $this->auditLogService->log($user->id, 'payment.create', Payment::class, $payment->id, null, $payment->toArray());

        return $payment;
    }
}
