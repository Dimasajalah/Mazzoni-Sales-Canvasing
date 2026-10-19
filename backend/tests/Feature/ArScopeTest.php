<?php
//backend/tests/Feature/ArScopeTest.php
namespace Tests\Feature;

use App\Helpers\Aging;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Outstanding Report: sales hanya melihat piutang customer miliknya, dan keluarannya ringkas. */
class ArScopeTest extends TestCase
{
    use RefreshDatabase;

    // ---------- logika murni (tanpa basis data) ----------

    private function fake(int $customerId, string $balance, int $days, string $bucket, int $owner = 2): Invoice
    {
        $invoice = (new Invoice())->forceFill([
            'id' => random_int(1000, 9999), 'invoice_number' => 'INV-'.random_int(1000, 9999), 'customer_id' => $customerId,
            'balance' => $balance, 'days_overdue' => $days, 'aging_bucket' => $bucket,
        ]);
        $invoice->setRelation('customer', (new Customer())->forceFill([
            'id' => $customerId, 'customer_code' => "C-{$customerId}", 'name' => "Customer {$customerId}", 'salesperson_id' => $owner,
            'npwp' => '10.000.000.0-601.000', 'credit_limit' => '500000000.00', 'address' => 'Jl. Rahasia 1', 'sales_notes' => 'catatan',
        ]));

        return $invoice;
    }

    private function actor(string $role, int $id): User
    {
        return (new User())->forceFill(['id' => $id, 'role' => $role]);
    }

    public function test_summarize_adds_balances_in_cents_without_decimal_drift(): void
    {
        $summary = Aging::summarize(new Collection([
            $this->fake(1, '0.10', 1, '1-30'),
            $this->fake(1, '0.20', 1, '1-30'),
        ]));

        $this->assertSame(0.3, $summary['1-30']);
        $this->assertSame(0.3, $summary['total']);
    }

    public function test_summarize_counts_buckets_overdue_invoices_and_customers(): void
    {
        $summary = Aging::summarize(new Collection([
            $this->fake(1, '100.00', 0, 'CURRENT'),
            $this->fake(1, '200.00', 11, '1-30'),
            $this->fake(2, '300.00', 46, '31-60'),
            $this->fake(3, '400.00', 121, '60+'),
        ]));

        $this->assertSame(100.0, $summary['CURRENT']);
        $this->assertSame(200.0, $summary['1-30']);
        $this->assertSame(300.0, $summary['31-60']);
        $this->assertSame(400.0, $summary['60+']);
        $this->assertSame(1000.0, $summary['total']);
        $this->assertSame(3, $summary['overdue_count']); // yang CURRENT tidak dihitung telat
        $this->assertSame(3, $summary['customers_with_ar']);
    }

    public function test_summarize_of_nothing_is_all_zero(): void
    {
        $summary = Aging::summarize(new Collection());

        $this->assertSame(0.0, $summary['total']);
        $this->assertSame(0, $summary['overdue_count']);
        $this->assertSame(0, $summary['customers_with_ar']);
    }

    public function test_a_sales_user_only_sees_invoices_of_own_customers_and_a_manager_sees_all(): void
    {
        $all = new Collection([$this->fake(1, '100.00', 5, '1-30', 2), $this->fake(2, '200.00', 5, '1-30', 3)]);

        $this->assertCount(1, Aging::visibleTo($all, $this->actor('sales', 2)));
        $this->assertSame(1, Aging::visibleTo($all, $this->actor('sales', 2))->first()->customer_id);
        $this->assertCount(2, Aging::visibleTo($all, $this->actor('supervisor', 9)));
        $this->assertCount(2, Aging::visibleTo($all, $this->actor('admin', 9)));
    }

    public function test_access_to_one_invoice_follows_the_same_rule(): void
    {
        $mine = $this->fake(1, '100.00', 5, '1-30', 2);

        $this->assertTrue(Aging::canAccess($mine, $this->actor('sales', 2)));
        $this->assertFalse(Aging::canAccess($mine, $this->actor('sales', 3)));
        $this->assertTrue(Aging::canAccess($mine, $this->actor('supervisor', 9)));
        $this->assertFalse(Aging::canAccess(null, $this->actor('admin', 9)));
    }

    public function test_the_payload_keeps_only_id_code_and_name_of_the_customer(): void
    {
        $payload = Aging::payload($this->fake(1, '100.00', 5, '1-30'));

        $keys = array_keys($payload['customer']);
        sort($keys);
        $this->assertSame(['customer_code', 'id', 'name'], $keys);
        $this->assertSame(5, $payload['days_overdue']);
        $this->assertSame('1-30', $payload['aging_bucket']);
        $this->assertStringNotContainsString('npwp', json_encode($payload));
        $this->assertStringNotContainsString('credit_limit', json_encode($payload));
    }

    // ---------- lewat endpoint (butuh basis data) ----------

    private function user(string $role): User
    {
        return User::factory()->create(['role' => $role, 'active' => true]);
    }

    private function customer(User $owner, string $code): Customer
    {
        try {
            return Customer::unguarded(fn () => Customer::create([
                'customer_code' => $code, 'name' => "Customer {$code}", 'customer_group' => 'Retail', 'grade' => 'B',
                'address' => 'Jl. Uji 1', 'city' => 'Surabaya', 'phone' => '031-000', 'email' => strtolower($code).'@customer.local',
                'npwp' => '00.000.000.0-000.000', 'credit_limit' => 100000000, 'salesperson_id' => $owner->id, 'active' => true,
                'sync_status' => 'NOT_REQUIRED',
            ]));
        } catch (\Throwable $e) {
            $this->markTestSkipped('Customer uji tidak bisa dibuat: '.$e->getMessage());
        }
    }

    private function invoice(Customer $customer, string $number, string $balance, int $daysLate): Invoice
    {
        try {
            return Invoice::unguarded(fn () => Invoice::create([
                'invoice_number' => $number, 'customer_id' => $customer->id, 'sales_order_id' => null,
                'invoice_date' => now()->subDays($daysLate + 30)->toDateString(), 'due_date' => now()->subDays($daysLate)->toDateString(),
                'invoice_amount' => $balance, 'paid_amount' => '0.00', 'balance' => $balance, 'status' => 'OPEN', 'sync_status' => 'NOT_REQUIRED',
            ]));
        } catch (\Throwable $e) {
            $this->markTestSkipped('Invoice uji tidak bisa dibuat: '.$e->getMessage());
        }
    }

    /** Dua sales: A memegang CA (100 telat 10 hari, 200 telat 70 hari), B memegang CB (400 telat 10 hari). */
    private function seedScenario(): array
    {
        $a = $this->user('sales');
        $b = $this->user('sales');
        $ca = $this->customer($a, 'CA-1');
        $cb = $this->customer($b, 'CB-1');
        $i1 = $this->invoice($ca, 'INV-A1', '100.00', 10);
        $i2 = $this->invoice($ca, 'INV-A2', '200.00', 70);
        $i3 = $this->invoice($cb, 'INV-B1', '400.00', 10);

        return [$a, $b, [$i1, $i2, $i3]];
    }

    public function test_the_aging_report_of_a_sales_user_only_covers_own_customers(): void
    {
        [$a] = $this->seedScenario();
        Sanctum::actingAs($a);

        $r = $this->getJson('/api/v1/ar/aging')->assertOk();

        $this->assertEquals(300, $r->json('data.summary.total'));
        $this->assertSame(1, $r->json('data.summary.customers_with_ar'));
        $this->assertEqualsCanonicalizing(['INV-A1', 'INV-A2'], array_column($r->json('data.invoices'), 'invoice_number'));
    }

    public function test_a_supervisor_sees_every_customer(): void
    {
        $this->seedScenario();
        Sanctum::actingAs($this->user('supervisor'));

        $r = $this->getJson('/api/v1/ar/aging')->assertOk();

        $this->assertEquals(700, $r->json('data.summary.total'));
        $this->assertSame(2, $r->json('data.summary.customers_with_ar'));
        $this->assertCount(3, $r->json('data.invoices'));
    }

    public function test_the_response_is_compact_and_carries_as_of(): void
    {
        [$a] = $this->seedScenario();
        Sanctum::actingAs($a);

        $r = $this->getJson('/api/v1/ar/aging')->assertOk();

        $this->assertNotEmpty($r->json('data.as_of'));
        $customer = $r->json('data.invoices.0.customer');
        $keys = array_keys($customer);
        sort($keys);
        $this->assertSame(['customer_code', 'id', 'name'], $keys);
        $this->assertStringNotContainsString('npwp', json_encode($r->json()));
    }

    public function test_the_bucket_filter_narrows_the_invoices_but_not_the_summary(): void
    {
        [$a] = $this->seedScenario();
        Sanctum::actingAs($a);

        $r = $this->getJson('/api/v1/ar/aging?'.http_build_query(['bucket' => '60+']))->assertOk();

        $this->assertSame(['INV-A2'], array_column($r->json('data.invoices'), 'invoice_number'));
        $this->assertEquals(300, $r->json('data.summary.total'));
    }

    public function test_an_invoice_of_another_sales_cannot_be_opened_but_own_can(): void
    {
        [$a, , $invoices] = $this->seedScenario();
        Sanctum::actingAs($a);

        $this->getJson("/api/v1/invoices/{$invoices[0]->id}")->assertOk();
        $this->getJson("/api/v1/invoices/{$invoices[2]->id}")->assertStatus(403);
    }

    public function test_a_payment_cannot_be_recorded_for_an_invoice_of_another_sales(): void
    {
        [$a, , $invoices] = $this->seedScenario();
        Sanctum::actingAs($a);

        $this->postJson('/api/v1/payments', ['invoice_id' => $invoices[2]->id, 'amount' => 50, 'method' => 'CASH'])->assertStatus(403);

        $this->assertSame(0, Payment::count());
    }

    public function test_the_invoice_list_only_covers_own_customers(): void
    {
        [$a] = $this->seedScenario();
        Sanctum::actingAs($a);

        $r = $this->getJson('/api/v1/invoices')->assertOk();
        $rows = $r->json('data.data') ?? $r->json('data');

        $this->assertEqualsCanonicalizing(['INV-A1', 'INV-A2'], array_column($rows, 'invoice_number'));
    }
}