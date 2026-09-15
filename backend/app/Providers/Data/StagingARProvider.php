<?php

namespace App\Providers\Data;

use App\Contracts\ARDataProviderInterface;
use App\Models\Customer;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class StagingARProvider implements ARDataProviderInterface
{
    public function portfolioSummary(?int $salespersonId = null): array
    {
        $q = Invoice::query()->where('balance', '>', 0)->whereIn('status', ['OPEN', 'PARTIAL']);
        if ($salespersonId) {
            $q->whereHas('customer', fn ($c) => $c->where('salesperson_id', $salespersonId));
        }
        $invoices = $q->get();
        $buckets = [0, 0, 0, 0];
        $overdueInv = 0;
        foreach ($invoices as $inv) {
            $days = $this->daysOverdue($inv->due_date);
            $buckets[$this->bucketOf($days)] += (float) $inv->balance;
            if ($days > 0) {
                $overdueInv++;
            }
        }

        return [
            'total' => array_sum($buckets),
            'buckets' => [
                'current' => $buckets[0],
                '1_30' => $buckets[1],
                '31_60' => $buckets[2],
                '60_plus' => $buckets[3],
            ],
            'overdue_invoice_count' => $overdueInv,
            'customer_count' => $invoices->pluck('customer_id')->unique()->count(),
        ];
    }

    public function customerAging(int $customerId): array
    {
        $customer = Customer::findOrFail($customerId);
        $invoices = Invoice::where('customer_id', $customerId)
            ->where('balance', '>', 0)
            ->orderBy('due_date')
            ->get()
            ->map(function (Invoice $inv) {
                $days = $this->daysOverdue($inv->due_date);

                return [
                    'id' => $inv->id,
                    'invoice_number' => $inv->invoice_number,
                    'invoice_date' => $inv->invoice_date?->toDateString(),
                    'due_date' => $inv->due_date?->toDateString(),
                    'invoice_amount' => (float) $inv->invoice_amount,
                    'paid_amount' => (float) $inv->paid_amount,
                    'balance' => (float) $inv->balance,
                    'days_overdue' => $days,
                    'bucket' => $this->bucketLabel($days),
                    'status' => $inv->status,
                ];
            });

        $buckets = [0, 0, 0, 0];
        foreach ($invoices as $inv) {
            $buckets[$this->bucketOf($inv['days_overdue'])] += $inv['balance'];
        }

        return [
            'customer' => $customer,
            'total' => array_sum($buckets),
            'credit_limit' => (float) $customer->credit_limit,
            'buckets' => [
                'current' => $buckets[0],
                '1_30' => $buckets[1],
                '31_60' => $buckets[2],
                '60_plus' => $buckets[3],
            ],
            'invoices' => $invoices,
        ];
    }

    public function openInvoices(?int $customerId = null): Collection
    {
        $q = Invoice::with('customer')->where('balance', '>', 0);
        if ($customerId) {
            $q->where('customer_id', $customerId);
        }

        return $q->orderBy('due_date')->get();
    }

    public function daysOverdue($dueDate): int
    {
        $due = Carbon::parse($dueDate)->startOfDay();
        $today = Carbon::today();
        if ($today->lte($due)) {
            return 0;
        }

        return $due->diffInDays($today);
    }

    public function bucketOf(int $days): int
    {
        if ($days <= 0) {
            return 0;
        }
        if ($days <= 30) {
            return 1;
        }
        if ($days <= 60) {
            return 2;
        }

        return 3;
    }

    public function bucketLabel(int $days): string
    {
        return match ($this->bucketOf($days)) {
            0 => 'CURRENT',
            1 => '1-30',
            2 => '31-60',
            default => '60+',
        };
    }
}
