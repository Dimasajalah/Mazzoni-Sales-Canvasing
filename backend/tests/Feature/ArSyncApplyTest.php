<?php
// backend/tests/Feature/ArSyncApplyTest.php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use App\Services\AR\ArSyncWriter;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Tahap tulis ar:sync: customer minimal otomatis, invoice dikunci epicor_invoice_num, tanpa menghapus apa pun. */
class ArSyncApplyTest extends TestCase
{
    use RefreshDatabase;

    private function now(): Carbon
    {
        return Carbon::parse('2026-10-16 08:00:00', 'Asia/Jakarta');
    }

    /** Baris BAQ BMT_AgingAR untuk customer Epicor 99 yang belum ada di lokal. */
    private function row(array $override = []): array
    {
        return array_merge([
            'InvcHead_SysRowID' => '11111111-2222-3333-4444-555555555555',
            'InvcHead_InvoiceNum' => 20001,
            'InvcHead_InvoiceDate' => '2026-09-01T00:00:00+08:00',
            'InvcHead_InvoiceAmt' => 2000000,
            'InvcHead_InvoiceBal' => 1500000,
            'InvcHead_DueDate' => '2026-10-01T00:00:00+08:00',
            'InvcHead_CustNum' => 99,
            'Customer_CustID' => 'CUST-9999',
            'Customer_Name' => 'PT BARU',
            'InvcHead_Posted' => true,
            'InvcHead_CreditMemo' => false,
            'InvcHead_InvoiceHeld' => false,
        ], $override);
    }

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'active' => true]);
    }

    private function customer(string $code, ?string $epicorNum = null, ?int $salespersonId = null): Customer
    {
        return Customer::unguarded(fn () => Customer::create([
            'customer_code' => $code, 'name' => "Customer {$code}", 'customer_group' => 'Retail', 'grade' => 'B',
            'address' => 'Jl. Uji 1', 'city' => 'Surabaya', 'phone' => '031-000', 'email' => strtolower($code).'@customer.local',
            'npwp' => '00.000.000.0-000.000', 'credit_limit' => 100000000, 'salesperson_id' => $salespersonId, 'active' => true,
            'sync_status' => 'NOT_REQUIRED', 'epicor_customer_num' => $epicorNum,
        ]));
    }

    private function stagingInvoice(Customer $customer, string $number, string $balance): Invoice
    {
        return Invoice::unguarded(fn () => Invoice::create([
            'invoice_number' => $number, 'customer_id' => $customer->id, 'sales_order_id' => null,
            'invoice_date' => '2026-09-01', 'due_date' => '2026-09-30',
            'invoice_amount' => $balance, 'paid_amount' => '0.00', 'balance' => $balance, 'status' => 'OPEN', 'sync_status' => 'NOT_REQUIRED',
        ]));
    }

    private function apply(array $rows): array
    {
        return app(ArSyncWriter::class)->apply($rows, $this->now());
    }

    // ---------- penulis ----------

    public function test_an_unknown_epicor_customer_gets_a_minimal_customer_and_its_invoice_is_written(): void
    {
        $result = $this->apply([$this->row()]);

        $this->assertSame(1, $result['customers_created']);
        $this->assertSame(1, $result['invoices_created']);

        $customer = Customer::where('customer_code', 'CUST-9999')->firstOrFail();
        $this->assertSame('PT BARU', $customer->name);
        $this->assertSame('99', (string) $customer->epicor_customer_num);
        $this->assertNull($customer->salesperson_id);

        $invoice = Invoice::where('epicor_invoice_num', '20001')->firstOrFail();
        $this->assertEquals($customer->id, $invoice->customer_id);
        $this->assertSame('20001', (string) $invoice->invoice_number);
        $this->assertEquals(2000000, (float) $invoice->invoice_amount);
        $this->assertEquals(500000, (float) $invoice->paid_amount);
        $this->assertEquals(1500000, (float) $invoice->balance);
    }

    public function test_running_the_same_sync_twice_does_not_duplicate_anything(): void
    {
        $this->apply([$this->row()]);
        $second = $this->apply([$this->row()]);

        $this->assertSame(0, $second['customers_created']);
        $this->assertSame(0, $second['invoices_created']);
        $this->assertSame(1, $second['invoices_updated']);
        $this->assertSame(1, Customer::count());
        $this->assertSame(1, Invoice::count());
    }

    public function test_a_changed_balance_in_epicor_updates_the_same_invoice(): void
    {
        $this->apply([$this->row()]);
        $this->apply([$this->row(['InvcHead_InvoiceBal' => 700000])]);

        $this->assertSame(1, Invoice::count());
        $this->assertEquals(700000, (float) Invoice::firstOrFail()->balance);
    }

    public function test_an_existing_customer_with_the_same_code_and_no_epicor_number_is_linked_not_duplicated(): void
    {
        $existing = $this->customer('CUST-9999');

        $result = $this->apply([$this->row()]);

        $this->assertSame(0, $result['customers_created']);
        $this->assertSame(1, $result['customers_linked']);
        $this->assertSame(1, Customer::count());
        $this->assertSame('99', (string) $existing->fresh()->epicor_customer_num);
        $this->assertEquals($existing->id, Invoice::firstOrFail()->customer_id);
    }

    public function test_an_invoice_for_an_already_linked_customer_uses_that_customer_and_keeps_its_owner(): void
    {
        $owner = $this->user('sales');
        $mulya = $this->customer('MULYA', '16', $owner->id);

        $result = $this->apply([$this->row([
            'InvcHead_InvoiceNum' => 10009,
            'InvcHead_CustNum' => 16,
            'Customer_CustID' => 'CUST-2415',
            'Customer_Name' => 'PT MULYA ADI',
        ])]);

        $this->assertSame(0, $result['customers_created']);
        $this->assertSame(1, Customer::count());
        $this->assertEquals($mulya->id, Invoice::firstOrFail()->customer_id);
        $this->assertEquals($owner->id, $mulya->fresh()->salesperson_id);
    }

    public function test_staging_invoices_without_an_epicor_number_are_never_touched(): void
    {
        $customer = $this->customer('C-001', '6');
        $this->stagingInvoice($customer, 'INV-STG-1', '250000.00');

        $this->apply([$this->row()]);

        $this->assertSame(2, Invoice::count());
        $staging = Invoice::where('invoice_number', 'INV-STG-1')->firstOrFail();
        $this->assertNull($staging->epicor_invoice_num);
        $this->assertEquals(250000, (float) $staging->balance);
    }

    public function test_a_code_already_linked_to_another_epicor_customer_is_reported_and_skipped(): void
    {
        $this->customer('CUST-9999', '55');

        $result = $this->apply([$this->row()]);

        $this->assertSame(['CUST-9999'], $result['customer_conflicts']);
        $this->assertSame(0, $result['invoices_created']);
        $this->assertSame(1, Customer::count());
        $this->assertSame(0, Invoice::count());
    }

    public function test_an_invoice_number_used_by_a_non_epicor_invoice_is_reported_and_not_overwritten(): void
    {
        $customer = $this->customer('C-001', '6');
        $this->stagingInvoice($customer, '20001', '111.00');

        $result = $this->apply([$this->row(['InvcHead_CustNum' => 6, 'Customer_CustID' => 'CUST-0006'])]);

        $this->assertSame(['20001'], $result['invoice_conflicts']);
        $this->assertSame(0, $result['invoices_created']);
        $this->assertSame(1, Invoice::count());
        $this->assertEquals(111, (float) Invoice::firstOrFail()->balance);
    }

    // ---------- pemilik customer dari Sales Rep Epicor ----------

    private function salesWithCode(string $code): User
    {
        $user = $this->user('sales');
        $user->forceFill(['salesperson_code' => $code])->save();

        return $user;
    }

    public function test_a_new_customer_gets_its_owner_from_the_epicor_sales_rep_code(): void
    {
        $sales = $this->salesWithCode('SLS-001');

        $result = $this->apply([$this->row(['Customer_SalesRepCode' => 'SLS-001'])]);

        $this->assertSame([], $result['unresolved_reps']);
        $this->assertEquals($sales->id, Customer::where('customer_code', 'CUST-9999')->firstOrFail()->salesperson_id);
    }

    public function test_the_sales_owner_then_sees_the_invoice_in_the_report(): void
    {
        $sales = $this->salesWithCode('SLS-001');
        $this->apply([$this->row(['Customer_SalesRepCode' => 'SLS-001'])]);
        Sanctum::actingAs($sales);

        $r = $this->getJson('/api/v1/ar/aging')->assertOk();

        $this->assertSame(['20001'], array_map('strval', array_column($r->json('data.invoices'), 'invoice_number')));
    }

    public function test_a_sales_rep_code_without_a_matching_user_is_reported_and_leaves_the_customer_ownerless(): void
    {
        $result = $this->apply([$this->row(['Customer_SalesRepCode' => 'adminsystem'])]);

        $this->assertSame(['adminsystem'], $result['unresolved_reps']);
        $this->assertSame(1, $result['invoices_created']);
        $this->assertNull(Customer::where('customer_code', 'CUST-9999')->firstOrFail()->salesperson_id);
    }

    public function test_an_existing_customer_without_an_owner_gets_one_when_the_rep_code_matches(): void
    {
        $sales = $this->salesWithCode('SLS-001');
        $customer = $this->customer('BOX', '99');

        $result = $this->apply([$this->row(['Customer_SalesRepCode' => 'SLS-001'])]);

        $this->assertSame(1, $result['owners_filled']);
        $this->assertEquals($sales->id, $customer->fresh()->salesperson_id);
    }

    public function test_an_existing_owner_is_never_overwritten_by_the_epicor_sales_rep(): void
    {
        $owner = $this->user('sales');
        $this->salesWithCode('SLS-002');
        $customer = $this->customer('BOX', '99', $owner->id);

        $result = $this->apply([$this->row(['Customer_SalesRepCode' => 'SLS-002'])]);

        $this->assertSame(0, $result['owners_filled']);
        $this->assertEquals($owner->id, $customer->fresh()->salesperson_id);
    }

    // ---------- yang terlihat di /ar ----------

    public function test_a_supervisor_sees_the_invoice_of_a_customer_without_an_owner(): void
    {
        $this->apply([$this->row()]);
        Sanctum::actingAs($this->user('supervisor'));

        $r = $this->getJson('/api/v1/ar/aging')->assertOk();

        $this->assertSame(['20001'], array_map('strval', array_column($r->json('data.invoices'), 'invoice_number')));
        $this->assertEquals(1500000, $r->json('data.summary.total'));
    }

    public function test_a_sales_user_does_not_see_the_invoice_of_a_customer_without_an_owner(): void
    {
        $this->apply([$this->row()]);
        Sanctum::actingAs($this->user('sales'));

        $r = $this->getJson('/api/v1/ar/aging')->assertOk();

        $this->assertSame([], array_column($r->json('data.invoices'), 'invoice_number'));
    }

    // ---------- perintah ----------

    public function test_the_command_writes_from_a_file_with_apply_and_force(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'arsync');
        file_put_contents($path, json_encode(['value' => [$this->row()]]));

        $this->artisan('ar:sync', ['--file' => $path, '--apply' => true, '--force' => true])->assertExitCode(0);
        unlink($path);

        $this->assertSame(1, Customer::count());
        $this->assertSame(1, Invoice::count());
    }

    public function test_the_command_without_apply_writes_nothing(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'arsync');
        file_put_contents($path, json_encode(['value' => [$this->row()]]));

        $this->artisan('ar:sync', ['--file' => $path])->assertExitCode(0);
        unlink($path);

        $this->assertSame(0, Customer::count());
        $this->assertSame(0, Invoice::count());
    }

    public function test_the_command_writes_nothing_when_a_row_cannot_be_read(): void
    {
        $broken = $this->row(['InvcHead_InvoiceNum' => 20002]);
        unset($broken['InvcHead_InvoiceBal']);

        $path = tempnam(sys_get_temp_dir(), 'arsync');
        file_put_contents($path, json_encode(['value' => [$this->row(), $broken]]));

        $this->artisan('ar:sync', ['--file' => $path, '--apply' => true, '--force' => true])->assertExitCode(1);
        unlink($path);

        $this->assertSame(0, Customer::count());
        $this->assertSame(0, Invoice::count());
    }

    public function test_apply_cannot_be_combined_with_a_single_invoice(): void
    {
        $this->artisan('ar:sync', ['--apply' => true, '--invoice' => '20001'])->assertExitCode(1);

        $this->assertSame(0, Invoice::count());
    }
}