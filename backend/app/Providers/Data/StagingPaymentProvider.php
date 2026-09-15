<?php

namespace App\Providers\Data;

use App\Contracts\PaymentProviderInterface;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class StagingPaymentProvider implements PaymentProviderInterface
{
    public function create(array $data): Payment
    {
        return DB::transaction(function () use ($data) {
            $invoice = Invoice::lockForUpdate()->findOrFail($data['invoice_id']);
            $amount = (float) $data['amount'];

            if ($amount <= 0) {
                throw new InvalidArgumentException('Jumlah pembayaran harus lebih dari 0');
            }
            if ($amount > (float) $invoice->balance) {
                throw new InvalidArgumentException('Pembayaran melebihi outstanding invoice');
            }

            $payment = Payment::create($data);
            $invoice->paid_amount = (float) $invoice->paid_amount + $amount;
            $invoice->balance = max(0, (float) $invoice->invoice_amount - (float) $invoice->paid_amount);
            $invoice->status = $invoice->balance <= 0 ? 'PAID' : 'PARTIAL';
            $invoice->save();

            return $payment->load(['customer', 'invoice']);
        });
    }

    public function list(?int $customerId = null): iterable
    {
        $q = Payment::with(['customer', 'invoice'])->latest('id');
        if ($customerId) {
            $q->where('customer_id', $customerId);
        }

        return $q->limit(100)->get();
    }
}
