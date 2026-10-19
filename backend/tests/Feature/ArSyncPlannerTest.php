<?php
// backend/tests/Feature/ArSyncPlannerTest.php

namespace Tests\Feature;

use App\Services\AR\ArSyncPlanner;
use Carbon\Carbon;
use Tests\TestCase;

/** Perencana sinkronisasi AR: murni logika, tanpa database dan tanpa Epicor. */
class ArSyncPlannerTest extends TestCase
{
    /** Customer lokal MULYA, epicor_customer_num 16. */
    private function customers(): array
    {
        return ['16' => ['id' => 7, 'customer_code' => 'MULYA', 'salesperson_id' => 2]];
    }

    private function now(): Carbon
    {
        return Carbon::parse('2026-10-16 08:00:00', 'Asia/Jakarta');
    }

    /** Baris BAQ BMT_AgingAR untuk invoice 10009 (bentuk seperti hasil Test di BAQ Designer). */
    private function row(array $override = []): array
    {
        return array_merge([
            'InvcHead_SysRowID' => '87dfe6f3-5d55-4405-a3e2-634c084dce0a',
            'InvcHead_InvoiceNum' => 10009,
            'InvcHead_InvoiceDate' => '2026-10-15T00:00:00+08:00',
            'InvcHead_InvoiceAmt' => 4000000,
            'InvcHead_InvoiceBal' => 1000000,
            'InvcHead_DueDate' => '2026-10-15T00:00:00+08:00',
            'InvcHead_CustNum' => 16,
            'Customer_CustID' => 'CUST-2415',
            'Customer_Name' => 'PT MULYA ADI',
            'InvcHead_Posted' => true,
            'InvcHead_CreditMemo' => false,
            'InvcHead_InvoiceHeld' => false,
        ], $override);
    }

    private function plan(array $rows, ?Carbon $now = null): array
    {
        return (new ArSyncPlanner())->plan($rows, $this->customers(), $now ?? $this->now());
    }

    public function test_invoice_10009_from_the_real_baq_row_is_planned_as_one_day_overdue(): void
    {
        $plan = $this->plan([$this->row()]);

        $this->assertSame(1, $plan['groups']['ok']);
        $this->assertCount(1, $plan['ok']);

        $invoice = $plan['ok'][0];
        $this->assertSame('10009', $invoice['invoice_number']);
        $this->assertSame('10009', $invoice['epicor_invoice_num']);
        $this->assertSame(7, $invoice['customer_id']);
        $this->assertSame(2, $invoice['salesperson_id']);
        $this->assertSame('2026-10-15', $invoice['invoice_date']);
        $this->assertSame('2026-10-15', $invoice['due_date']);
        $this->assertSame('4000000.00', $invoice['invoice_amount']);
        $this->assertSame('3000000.00', $invoice['paid_amount']);
        $this->assertSame('1000000.00', $invoice['balance']);
        $this->assertSame(1, $invoice['days_overdue']);
        $this->assertSame('1-30', $invoice['aging_bucket']);

        $this->assertSame(1000000.0, $plan['total']);
        $this->assertSame(1000000.0, $plan['buckets']['1-30']);
        $this->assertSame(1, $plan['overdue_count']);
        $this->assertSame(1, $plan['customers_with_ar']);
    }

    public function test_today_follows_the_jakarta_date_not_the_utc_date(): void
    {
        // 15 Okt 23:30 UTC = 16 Okt 06:30 di Jakarta -> jatuh tempo 15 Okt sudah telat 1 hari
        $morningInJakarta = Carbon::parse('2026-10-15 23:30:00', 'UTC')->setTimezone('Asia/Jakarta');
        $this->assertSame(1, $this->plan([$this->row()], $morningInJakarta)['ok'][0]['days_overdue']);

        // 15 Okt 16:59 UTC = 15 Okt 23:59 di Jakarta -> masih jatuh tempo hari ini, belum telat
        $lateEveningInJakarta = Carbon::parse('2026-10-15 16:59:00', 'UTC')->setTimezone('Asia/Jakarta');
        $same = $this->plan([$this->row()], $lateEveningInJakarta)['ok'][0];
        $this->assertSame(0, $same['days_overdue']);
        $this->assertSame('CURRENT', $same['aging_bucket']);
    }

    public function test_bucket_boundaries_and_counts(): void
    {
        $now = $this->now();
        $cases = [[1, -5], [2, 0], [3, 1], [4, 30], [5, 31], [6, 60], [7, 61]]; // [no. invoice, hari telat]
        $rows = [];
        foreach ($cases as [$num, $late]) {
            $rows[] = $this->row([
                'InvcHead_InvoiceNum' => $num,
                'InvcHead_InvoiceAmt' => 100,
                'InvcHead_InvoiceBal' => 100,
                'InvcHead_DueDate' => $now->copy()->subDays($late)->format('Y-m-d').'T00:00:00+08:00',
            ]);
        }

        $plan = $this->plan($rows, $now);

        $this->assertSame(200.0, $plan['buckets']['CURRENT']); // belum jatuh tempo dan jatuh tempo hari ini
        $this->assertSame(200.0, $plan['buckets']['1-30']);    // 1 dan 30 hari
        $this->assertSame(200.0, $plan['buckets']['31-60']);   // 31 dan 60 hari
        $this->assertSame(100.0, $plan['buckets']['60+']);     // 61 hari
        $this->assertSame(700.0, $plan['total']);
        $this->assertSame(5, $plan['overdue_count']);
    }

    public function test_credit_memo_unposted_and_zero_balance_are_kept_out_of_the_total(): void
    {
        $plan = $this->plan([
            $this->row(['InvcHead_InvoiceNum' => 1]),
            $this->row(['InvcHead_InvoiceNum' => 2, 'InvcHead_CreditMemo' => true]),
            $this->row(['InvcHead_InvoiceNum' => 3, 'InvcHead_Posted' => false]),
            $this->row(['InvcHead_InvoiceNum' => 4, 'InvcHead_InvoiceBal' => 0]),
            $this->row(['InvcHead_InvoiceNum' => 5, 'InvcHead_InvoiceBal' => -250000]),
        ]);

        $this->assertSame(1, $plan['groups']['ok']);
        $this->assertSame(1, $plan['groups']['credit_memo']);
        $this->assertSame(1, $plan['groups']['not_posted']);
        $this->assertSame(2, $plan['groups']['zero_balance']);
        $this->assertSame(1000000.0, $plan['total']);
    }

    public function test_an_epicor_customer_without_a_local_match_is_reported_and_skipped(): void
    {
        $plan = $this->plan([
            $this->row(['InvcHead_InvoiceNum' => 1]),
            $this->row(['InvcHead_InvoiceNum' => 2, 'InvcHead_CustNum' => 99, 'Customer_CustID' => 'CUST-9999', 'Customer_Name' => 'PT TANPA PADANAN', 'InvcHead_InvoiceBal' => 300]),
            $this->row(['InvcHead_InvoiceNum' => 3, 'InvcHead_CustNum' => 99, 'Customer_CustID' => 'CUST-9999', 'Customer_Name' => 'PT TANPA PADANAN', 'InvcHead_InvoiceBal' => 200]),
        ]);

        $this->assertSame(1, $plan['groups']['ok']);
        $this->assertSame(2, $plan['groups']['unmatched_customer']);
        $this->assertSame(1000000.0, $plan['total']);
        $this->assertCount(1, $plan['unmatched']);
        $this->assertSame('99', $plan['unmatched'][0]['cust_num']);
        $this->assertSame('CUST-9999', $plan['unmatched'][0]['cust_id']);
        $this->assertSame(2, $plan['unmatched'][0]['invoices']);
        $this->assertSame(500.0, $plan['unmatched'][0]['total']);
    }

    public function test_a_row_with_missing_columns_is_counted_as_malformed_and_not_guessed(): void
    {
        $withoutBalance = $this->row(['InvcHead_InvoiceNum' => 1]);
        unset($withoutBalance['InvcHead_InvoiceBal']);

        $withoutPosted = $this->row(['InvcHead_InvoiceNum' => 2]);
        unset($withoutPosted['InvcHead_Posted']);

        $plan = $this->plan([$withoutBalance, $withoutPosted, $this->row(['InvcHead_InvoiceNum' => 3])]);

        $this->assertSame(2, $plan['groups']['malformed']);
        $this->assertSame(1, $plan['groups']['ok']);
        $this->assertSame(1000000.0, $plan['total']);
    }

    public function test_epicor_dates_with_a_plus_8_offset_keep_their_calendar_date(): void
    {
        // Epicor mengirim "2026-10-15T00:00:00+08:00". Bila dikonversi ke UTC atau Jakarta, tanggalnya mundur ke 14 Okt.
        $invoice = $this->plan([$this->row([
            'InvcHead_InvoiceDate' => '2026-10-15T00:00:00+08:00',
            'InvcHead_DueDate' => '2026-10-15T00:00:00+08:00',
        ])])['ok'][0];

        $this->assertSame('2026-10-15', $invoice['invoice_date']);
        $this->assertSame('2026-10-15', $invoice['due_date']);
    }

    public function test_planning_with_new_customers_counts_every_invoice_and_every_new_customer(): void
    {
        $plan = (new ArSyncPlanner())->planIncludingNewCustomers([
            $this->row(['InvcHead_InvoiceNum' => 1]),
            $this->row(['InvcHead_InvoiceNum' => 2, 'InvcHead_CustNum' => 99, 'Customer_CustID' => 'CUST-9999', 'Customer_Name' => 'PT BARU A', 'InvcHead_InvoiceAmt' => 300, 'InvcHead_InvoiceBal' => 300]),
            $this->row(['InvcHead_InvoiceNum' => 3, 'InvcHead_CustNum' => 98, 'Customer_CustID' => 'CUST-9998', 'Customer_Name' => 'PT BARU B', 'InvcHead_InvoiceAmt' => 200, 'InvcHead_InvoiceBal' => 200]),
        ], $this->customers(), $this->now());

        $this->assertSame(3, $plan['groups']['ok']);
        $this->assertSame(0, $plan['groups']['unmatched_customer']);
        $this->assertSame(1000500.0, $plan['total']);
        $this->assertSame(3, $plan['customers_with_ar']);
        $this->assertCount(2, $plan['new_customers']);
    }

    public function test_the_epicor_sales_rep_code_is_carried_into_planned_and_unmatched_rows(): void
    {
        $plan = $this->plan([
            $this->row(['InvcHead_InvoiceNum' => 1, 'Customer_SalesRepCode' => 'SLS-001']),
            $this->row(['InvcHead_InvoiceNum' => 2, 'InvcHead_CustNum' => 99, 'Customer_CustID' => 'CUST-9999', 'Customer_SalesRepCode' => 'adminsystem']),
        ]);

        $this->assertSame('SLS-001', $plan['ok'][0]['sales_rep']);
        $this->assertSame('adminsystem', $plan['unmatched'][0]['sales_rep']);
    }

    public function test_balances_are_added_in_cents_without_decimal_drift(): void
    {
        $plan = $this->plan([
            $this->row(['InvcHead_InvoiceNum' => 1, 'InvcHead_InvoiceAmt' => 0.30, 'InvcHead_InvoiceBal' => 0.10]),
            $this->row(['InvcHead_InvoiceNum' => 2, 'InvcHead_InvoiceAmt' => 0.30, 'InvcHead_InvoiceBal' => 0.20]),
        ]);

        $this->assertSame(0.3, $plan['total']);
        $this->assertSame('0.10', $plan['ok'][0]['balance']);
        $this->assertSame('0.20', $plan['ok'][0]['paid_amount']);
    }
}