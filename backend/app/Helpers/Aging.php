<?php

namespace App\Helpers;

use App\Models\Invoice;
use App\Models\User;
use Illuminate\Support\Collection;

/** Pembantu aging AR: pembatas per sales, ringkasan bucket, dan bentuk keluaran yang ringkas. */
class Aging
{
    public const BUCKETS = ['CURRENT', '1-30', '31-60', '60+'];

    /**
     * Invoice milik customer yang dipegang sales itu (Customer.salesperson_id).
     * Peran selain sales (supervisor, admin) melihat semuanya, sama seperti statistik di DashboardService.
     */
    public static function visibleTo(Collection $invoices, User $user): Collection
    {
        if ($user->role !== 'sales') {
            return $invoices;
        }

        return $invoices
            ->filter(fn (Invoice $invoice) => (int) $invoice->customer?->salesperson_id === (int) $user->id)
            ->values();
    }

    public static function canAccess(?Invoice $invoice, User $user): bool
    {
        if (! $invoice) {
            return false;
        }
        if ($user->role !== 'sales') {
            return true;
        }

        $invoice->loadMissing('customer');

        return (int) $invoice->customer?->salesperson_id === (int) $user->id;
    }

    /**
     * Ringkasan bucket dari invoice terbuka. Dijumlah dalam sen supaya tidak ada selisih desimal.
     *
     * @return array<string, float|int>
     */
    public static function summarize(Collection $invoices): array
    {
        $cents = ['CURRENT' => 0, '1-30' => 0, '31-60' => 0, '60+' => 0];
        $total = 0;
        $overdue = 0;
        $customers = [];

        foreach ($invoices as $invoice) {
            $bucket = $invoice->aging_bucket ?? $invoice->agingBucket();
            if (! array_key_exists($bucket, $cents)) {
                $bucket = 'CURRENT';
            }

            $value = (int) round(((float) $invoice->balance) * 100);
            $cents[$bucket] += $value;
            $total += $value;

            if ((int) ($invoice->days_overdue ?? $invoice->daysOverdue()) > 0) {
                $overdue++;
            }
            if ($value > 0) {
                $customers[$invoice->customer_id] = true;
            }
        }

        // Selalu float: di PHP, 10000 / 100 menghasilkan integer, bukan 100.0.
        $rupiah = fn (int $sen): float => $sen / 100;

        return [
            'CURRENT' => $rupiah($cents['CURRENT']),
            '1-30' => $rupiah($cents['1-30']),
            '31-60' => $rupiah($cents['31-60']),
            '60+' => $rupiah($cents['60+']),
            'total' => $rupiah($total),
            'overdue_count' => $overdue,
            'customers_with_ar' => count($customers),
        ];
    }

    /**
     * Keluaran ringkas satu invoice untuk laporan piutang: hanya yang dibutuhkan layar.
     * Data customer dibatasi ke id, kode, dan nama (tanpa NPWP, batas kredit, alamat, koordinat, atau catatan).
     *
     * @return array<string, mixed>
     */
    public static function payload(Invoice $invoice): array
    {
        return [
            'id' => $invoice->id,
            'invoice_number' => $invoice->invoice_number,
            'customer_id' => $invoice->customer_id,
            'invoice_date' => $invoice->invoice_date?->toDateString(),
            'due_date' => $invoice->due_date?->toDateString(),
            'invoice_amount' => $invoice->invoice_amount,
            'paid_amount' => $invoice->paid_amount,
            'balance' => $invoice->balance,
            'status' => $invoice->status,
            'days_overdue' => (int) ($invoice->days_overdue ?? $invoice->daysOverdue()),
            'aging_bucket' => $invoice->aging_bucket ?? $invoice->agingBucket(),
            'customer' => $invoice->customer ? [
                'id' => $invoice->customer->id,
                'customer_code' => $invoice->customer->customer_code,
                'name' => $invoice->customer->name,
            ] : null,
        ];
    }
}