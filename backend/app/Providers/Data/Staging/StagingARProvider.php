<?php

namespace App\Providers\Data\Staging;

use App\Models\Invoice;
use App\Providers\Data\Contracts\ARDataProviderInterface;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class StagingARProvider implements ARDataProviderInterface
{
    public function invoices(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Invoice::query()->with(['customer', 'salesOrder']);

        if (! empty($filters['customer_id'])) {
            $query->where('customer_id', $filters['customer_id']);
        }

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['q'])) {
            $q = $filters['q'];
            $query->where('invoice_number', 'like', "%{$q}%");
        }

        return $query->orderBy('due_date')->paginate($perPage);
    }

    public function findInvoice(int $id): ?Invoice
    {
        return Invoice::with(['customer', 'lines.product', 'payments'])->find($id);
    }

    public function agingSummary(?int $customerId = null): array
    {
        $invoices = $this->openInvoices($customerId);
        $summary = [
            'CURRENT' => 0.0,
            '1-30' => 0.0,
            '31-60' => 0.0,
            '60+' => 0.0,
            'total' => 0.0,
            'overdue_count' => 0,
        ];

        foreach ($invoices as $invoice) {
            $bucket = $invoice->agingBucket();
            $balance = (float) $invoice->balance;
            $summary[$bucket] += $balance;
            $summary['total'] += $balance;
            if ($invoice->daysOverdue() > 0) {
                $summary['overdue_count']++;
            }
        }

        return $summary;
    }

    public function agingInvoices(?int $customerId = null, ?string $bucket = null): Collection
    {
        $invoices = $this->openInvoices($customerId)->map(function (Invoice $invoice) {
            $invoice->setAttribute('days_overdue', $invoice->daysOverdue());
            $invoice->setAttribute('aging_bucket', $invoice->agingBucket());

            return $invoice;
        });

        if ($bucket && $bucket !== 'ALL') {
            $invoices = $invoices->filter(fn (Invoice $invoice) => $invoice->aging_bucket === $bucket)->values();
        }

        return $invoices->sortByDesc('days_overdue')->values();
    }

    protected function openInvoices(?int $customerId = null): Collection
    {
        $query = Invoice::query()
            ->with('customer')
            ->where('balance', '>', 0)
            ->whereIn('status', ['OPEN', 'PARTIAL']);

        if ($customerId) {
            $query->where('customer_id', $customerId);
        }

        return $query->get();
    }
}
