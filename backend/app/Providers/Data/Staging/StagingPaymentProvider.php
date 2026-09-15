<?php

namespace App\Providers\Data\Staging;

use App\Models\Invoice;
use App\Models\Payment;
use App\Providers\Data\Contracts\PaymentProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StagingPaymentProvider implements PaymentProviderInterface
{
    public function paginate(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Payment::query()->with(['customer', 'invoice', 'salesperson']);

        if (! empty($filters['customer_id'])) {
            $query->where('customer_id', $filters['customer_id']);
        }

        if (! empty($filters['invoice_id'])) {
            $query->where('invoice_id', $filters['invoice_id']);
        }

        return $query->latest('payment_date')->paginate($perPage);
    }

    public function create(array $data): Payment
    {
        return DB::transaction(function () use ($data) {
            $invoice = Invoice::lockForUpdate()->findOrFail($data['invoice_id']);
            $amount = (float) $data['amount'];

            if ($amount <= 0) {
                throw ValidationException::withMessages(['amount' => ['Payment amount must be greater than zero.']]);
            }

            if ($amount > (float) $invoice->balance + 0.00001) {
                throw ValidationException::withMessages([
                    'amount' => ['Payment amount exceeds invoice balance.'],
                ]);
            }

            $payment = Payment::create([
                'customer_id' => $data['customer_id'] ?? $invoice->customer_id,
                'invoice_id' => $invoice->id,
                'amount' => $amount,
                'method' => $data['method'],
                'reference' => $data['reference'] ?? null,
                'payment_date' => $data['payment_date'] ?? now()->toDateString(),
                'salesperson_id' => $data['salesperson_id'] ?? null,
                'notes' => $data['notes'] ?? null,
            ]);

            $invoice->paid_amount = (float) $invoice->paid_amount + $amount;
            $invoice->balance = max(0, (float) $invoice->invoice_amount - (float) $invoice->paid_amount);
            $invoice->status = $invoice->balance <= 0 ? 'PAID' : 'PARTIAL';
            $invoice->save();

            return $payment->load(['customer', 'invoice', 'salesperson']);
        });
    }
}
