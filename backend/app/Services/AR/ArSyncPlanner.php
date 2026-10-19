<?php
// backend/app/Services/AR/ArSyncPlanner.php

namespace App\Services\AR;

use Carbon\CarbonInterface;

/**
 * Menyusun rencana sinkronisasi AR dari baris BAQ BMT_AgingAR.
 *
 * Murni logika: tidak membaca atau menulis database dan tidak memanggil jaringan,
 * sehingga bisa diuji tanpa Epicor.
 *
 * Setiap baris masuk ke tepat satu kelompok, dengan urutan prioritas:
 * malformed -> credit_memo -> not_posted -> zero_balance -> unmatched_customer -> ok
 */
class ArSyncPlanner
{
    public const BUCKETS = ['CURRENT', '1-30', '31-60', '60+'];

    /**
     * @param  array<int, array<string, mixed>>  $rows       baris hasil BAQ (kunci = Alias)
     * @param  array<string, array{id:int, customer_code:string, salesperson_id:?int}>  $customers
     *         customer lokal, dikunci epicor_customer_num (sebagai teks)
     * @param  CarbonInterface  $now  "hari ini" ditentukan dari zona waktu objek ini (pakai Asia/Jakarta)
     */
    public function plan(array $rows, array $customers, CarbonInterface $now): array
    {
        $groups = [
            'ok' => 0,
            'unmatched_customer' => 0,
            'credit_memo' => 0,
            'not_posted' => 0,
            'zero_balance' => 0,
            'malformed' => 0,
        ];
        $bucketCents = array_fill_keys(self::BUCKETS, 0);
        $ok = [];
        $unmatched = [];
        $trace = [];
        $totalCents = 0;
        $overdueCount = 0;
        $heldInOk = 0;
        $customerIds = [];

        foreach ($rows as $row) {
            $num = $row['InvcHead_InvoiceNum'] ?? null;
            $custNum = $row['InvcHead_CustNum'] ?? null;
            $balance = $this->cents($row['InvcHead_InvoiceBal'] ?? null);
            $amount = $this->cents($row['InvcHead_InvoiceAmt'] ?? null);
            $dueDate = $this->dateOnly($row['InvcHead_DueDate'] ?? null);
            $invoiceDate = $this->dateOnly($row['InvcHead_InvoiceDate'] ?? null);
            $label = $num === null ? '?' : (string) $num;
            $rep = trim((string) ($row['Customer_SalesRepCode'] ?? ''));

            if (
                $num === null || $custNum === null || $balance === null || $amount === null
                || $dueDate === null || $invoiceDate === null
                || ! array_key_exists('InvcHead_Posted', $row)
                || ! array_key_exists('InvcHead_CreditMemo', $row)
            ) {
                $groups['malformed']++;
                $trace[] = ['invoice' => $label, 'group' => 'malformed'];
                continue;
            }

            if ($this->flag($row['InvcHead_CreditMemo'])) {
                $groups['credit_memo']++;
                $trace[] = ['invoice' => $label, 'group' => 'credit_memo'];
                continue;
            }

            if (! $this->flag($row['InvcHead_Posted'])) {
                $groups['not_posted']++;
                $trace[] = ['invoice' => $label, 'group' => 'not_posted'];
                continue;
            }

            if ($balance <= 0) {
                $groups['zero_balance']++;
                $trace[] = ['invoice' => $label, 'group' => 'zero_balance'];
                continue;
            }

            $key = (string) $custNum;

            if (! isset($customers[$key])) {
                $groups['unmatched_customer']++;
                $trace[] = ['invoice' => $label, 'group' => 'unmatched_customer'];
                $unmatched[$key] ??= [
                    'cust_num' => $key,
                    'cust_id' => (string) ($row['Customer_CustID'] ?? ''),
                    'name' => (string) ($row['Customer_Name'] ?? ''),
                    'sales_rep' => '',
                    'invoices' => 0,
                    'cents' => 0,
                ];
                if ($unmatched[$key]['sales_rep'] === '' && $rep !== '') {
                    $unmatched[$key]['sales_rep'] = $rep;
                }
                $unmatched[$key]['invoices']++;
                $unmatched[$key]['cents'] += $balance;
                continue;
            }

            $customer = $customers[$key];
            $days = max(0, $this->daysOverdue($dueDate, $now));
            $bucket = $this->bucket($days);

            $groups['ok']++;
            $trace[] = ['invoice' => $label, 'group' => 'ok'];
            $totalCents += $balance;
            $bucketCents[$bucket] += $balance;
            $customerIds[$customer['id']] = true;

            if ($days > 0) {
                $overdueCount++;
            }
            if ($this->flag($row['InvcHead_InvoiceHeld'] ?? false)) {
                $heldInOk++;
            }

            $ok[] = [
                'invoice_number' => $label,
                'epicor_invoice_num' => $label,
                'customer_id' => $customer['id'],
                'salesperson_id' => $customer['salesperson_id'],
                'invoice_date' => $invoiceDate,
                'due_date' => $dueDate,
                'invoice_amount' => $this->money($amount),
                'paid_amount' => $this->money($amount - $balance),
                'balance' => $this->money($balance),
                'days_overdue' => $days,
                'aging_bucket' => $bucket,
                'sales_rep' => $rep,
            ];
        }

        $unmatchedList = array_map(fn (array $u) => [
            'cust_num' => $u['cust_num'],
            'cust_id' => $u['cust_id'],
            'name' => $u['name'],
            'sales_rep' => $u['sales_rep'],
            'invoices' => $u['invoices'],
            'total' => $u['cents'] / 100.0,
        ], array_values($unmatched));
        usort($unmatchedList, fn (array $a, array $b) => $b['total'] <=> $a['total']);

        return [
            'total_rows' => count($rows),
            'groups' => $groups,
            'ok' => $ok,
            'total' => $totalCents / 100.0,
            'buckets' => array_map(fn (int $c) => $c / 100.0, $bucketCents),
            'overdue_count' => $overdueCount,
            'customers_with_ar' => count($customerIds),
            'held_in_ok' => $heldInOk,
            'unmatched' => $unmatchedList,
            'trace' => $trace,
        ];
    }

    /**
     * Seperti plan(), tetapi customer Epicor yang belum ada di lokal dihitung sebagai customer baru
     * (tanpa sales pemilik), supaya total dan bucket mencerminkan isi /ar setelah --apply.
     * Id customer baru di sini hanya penanda sementara (negatif) dan tidak pernah disimpan.
     */
    public function planIncludingNewCustomers(array $rows, array $customers, CarbonInterface $now): array
    {
        $first = $this->plan($rows, $customers, $now);

        $placeholder = 0;
        foreach ($first['unmatched'] as $new) {
            $customers[$new['cust_num']] = [
                'id' => --$placeholder,
                'customer_code' => $new['cust_id'],
                'salesperson_id' => null,
            ];
        }

        $plan = $this->plan($rows, $customers, $now);
        $plan['new_customers'] = $first['unmatched'];

        return $plan;
    }

    /** Hari telat dihitung dari tanggal saja (tanpa jam), memakai tanggal lokal milik $now. */
    private function daysOverdue(string $dueDate, CarbonInterface $now): int
    {
        $due = strtotime($dueDate.' 00:00:00 UTC');
        $today = strtotime($now->format('Y-m-d').' 00:00:00 UTC');

        return (int) floor(($today - $due) / 86400);
    }

    private function bucket(int $days): string
    {
        return match (true) {
            $days <= 0 => 'CURRENT',
            $days <= 30 => '1-30',
            $days <= 60 => '31-60',
            default => '60+',
        };
    }

    /** Uang dijumlahkan dalam sen (bilangan bulat) supaya tidak ada selisih desimal. */
    private function cents(mixed $value): ?int
    {
        if ($value === null || $value === '' || ! is_numeric($value)) {
            return null;
        }

        return (int) round(((float) $value) * 100);
    }

    private function money(int $cents): string
    {
        return number_format($cents / 100, 2, '.', '');
    }

    /** Tanggal dari Epicor datang sebagai "2026-10-15T00:00:00" tanpa zona waktu; ambil tanggalnya saja. */
    private function dateOnly(mixed $value): ?string
    {
        if (! is_string($value) || ! preg_match('/^(\d{4}-\d{2}-\d{2})/', $value, $m)) {
            return null;
        }

        return $m[1];
    }

    private function flag(mixed $value): bool
    {
        return $value === true
            || $value === 1
            || $value === '1'
            || (is_string($value) && strtolower($value) === 'true');
    }
}