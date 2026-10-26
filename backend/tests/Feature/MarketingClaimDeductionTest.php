<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingClaim;
use App\Models\MarketingClaimDeduction;
use App\Models\MarketingEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.10 / MKT10: Metode Pencairan Program, Potong Nota. */
class MarketingClaimDeductionTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function user(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(User $u): User
    {
        Sanctum::actingAs($u);

        return $u;
    }

    private function program(): MarketingEvent
    {
        if ($existing = MarketingEvent::where('activity_type', 'KLAIM')->first()) {
            return $existing;
        }
        $this->actAs($this->user('admin'));
        Customer::firstOrCreate(['customer_code' => 'SEED'], ['name' => 'Seed', 'active' => true]);
        $budget = MarketingBudget::first() ?? MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 100000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        $id = $this->postJson('/api/v1/marketing/claim-programs', [
            'marketing_budget_id' => $budget->id, 'description' => 'Diskon Saus Q4', 'reference_letter_no' => 'SKP/'.uniqid(),
            'claim_type' => 'DISKON_PRODUK', 'claim_source' => 'SELL_OUT', 'claim_basis' => 'SALES_VALUE', 'claim_rate_type' => 'PERCENT',
            'claim_rate' => 2.5, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'claim_deadline' => '2026-12-15',
            'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201)->json('data.id');

        return MarketingEvent::find($id);
    }

    /** Klaim yang sudah disetujui (Nilai Klaim Disetujui Rp 10.000, Potong Nota), milik distributor yang ditangani $sales. */
    private function claim(?User $sales = null, array $over = []): MarketingClaim
    {
        $program = $this->program();
        $this->seq++;
        $distributor = Customer::create([
            'customer_code' => 'DIST'.$this->seq, 'name' => 'Distributor '.$this->seq, 'city' => 'Surabaya', 'active' => true,
            'salesperson_id' => $sales?->id,
        ]);

        return MarketingClaim::create($over + [
            'claim_no' => 'CLM-2026-'.str_pad((string) $this->seq, 5, '0', STR_PAD_LEFT),
            'marketing_event_id' => $program->id, 'customer_id' => $distributor->id, 'letter_received_date' => '2026-12-10',
            'claimed_amount' => 12000, 'eligible_amount' => 10000, 'difference_amount' => 2000, 'status' => 'APPROVED',
            'approved_amount' => 10000, 'payout_method' => 'POTONG_NOTA', 'approval_stage' => 4,
        ]);
    }

    private function postInvoice(int $id, array $over = [])
    {
        return $this->postJson("/api/v1/marketing/deduction-claims/{$id}/post-invoice", $over + ['invoice_number' => 'INV-001', 'invoice_total' => 15000]);
    }

    public function test_check_pengajuan_klaim_lists_only_approved_potong_nota_claims_that_still_have_balance(): void
    {
        $open = $this->claim();
        $this->claim(null, ['payout_method' => 'TRANSFER']);   // metode lain
        $this->claim(null, ['status' => 'IN_APPROVAL']);        // belum disetujui
        $used = $this->claim();
        $this->actAs($this->user('supervisor'));
        $this->postInvoice($used->id, ['invoice_total' => 10000])->assertStatus(201); // saldo habis

        $r = $this->getJson('/api/v1/marketing/deduction-claims')->assertOk();

        $this->assertSame([$open->id], array_column($r->json('data'), 'id'));
        $this->assertEquals(10000, $r->json('data.0.balance'));
        $this->assertEquals(0, $r->json('data.0.used_total'));
        $this->assertSame($open->customer->name, $r->json('data.0.customer.name'));

        $search = $this->getJson('/api/v1/marketing/deduction-claims?q='.$open->claim_no)->assertOk();
        $this->assertCount(1, $search->json('data'));
        $this->assertCount(0, $this->getJson('/api/v1/marketing/deduction-claims?q=tidak-ada')->json('data'));
    }

    public function test_an_invoice_bigger_than_the_balance_uses_the_whole_balance_as_a_negative_misc_charge(): void
    {
        $c = $this->claim();
        $this->actAs($this->user('supervisor'));

        $r = $this->postInvoice($c->id, ['invoice_number' => 'INV-001', 'invoice_date' => '2026-12-20', 'invoice_total' => 15000])->assertStatus(201);

        $d = $r->json('data.deductions.0');
        $this->assertEquals(10000, $d['claim_amount_used']);
        $this->assertSame('KLAIM', $d['misc_charge_code']);
        $this->assertEquals(-10000, $d['misc_charge_amount']);   // potongan bernilai negatif
        $this->assertSame($c->claim_no, $d['reference']);          // kode klaim pada Reference
        $this->assertEquals(5000, $d['net_invoice']);
        $this->assertEquals(10000, $d['balance_before']);
        $this->assertEquals(0, $d['balance_after']);
        $this->assertFalse($d['capped_by_invoice']);
        $this->assertSame('2026-12-20', $d['invoice_date']);
        $this->assertEquals(0, $r->json('data.balance'));
    }

    public function test_when_the_balance_covers_the_invoice_the_used_value_is_limited_to_the_invoice_total(): void
    {
        $c = $this->claim();
        $this->actAs($this->user('supervisor'));

        $r = $this->postInvoice($c->id, ['invoice_total' => 4000])->assertStatus(201);

        $d = $r->json('data.deductions.0');
        $this->assertEquals(4000, $d['claim_amount_used']);       // tidak melebihi nilai invoice
        $this->assertTrue($d['capped_by_invoice']);                 // saldo >= total invoice
        $this->assertEquals(0, $d['net_invoice']);
        $this->assertEquals(6000, $r->json('data.balance'));
    }

    public function test_the_used_value_can_be_edited_downwards(): void
    {
        $c = $this->claim();
        $this->actAs($this->user('supervisor'));

        $r = $this->postInvoice($c->id, ['invoice_total' => 15000, 'used_amount' => 3000])->assertStatus(201);

        $this->assertEquals(3000, $r->json('data.deductions.0.claim_amount_used'));
        $this->assertEquals(-3000, $r->json('data.deductions.0.misc_charge_amount'));
        $this->assertEquals(12000, $r->json('data.deductions.0.net_invoice'));
        $this->assertEquals(7000, $r->json('data.balance'));
    }

    public function test_the_used_value_cannot_exceed_the_invoice_or_the_balance(): void
    {
        $c = $this->claim();
        $this->actAs($this->user('supervisor'));

        $tooMuchForInvoice = $this->postInvoice($c->id, ['invoice_total' => 4000, 'used_amount' => 5000])->assertStatus(422);
        $this->assertStringContainsString('tidak boleh melebihi total invoice', $tooMuchForInvoice->json('message'));

        $tooMuchForBalance = $this->postInvoice($c->id, ['invoice_total' => 50000, 'used_amount' => 12000])->assertStatus(422);
        $this->assertStringContainsString('melebihi saldo klaim', $tooMuchForBalance->json('message'));

        $this->postInvoice($c->id, ['used_amount' => 0])->assertStatus(422);
        $this->postInvoice($c->id, ['used_amount' => -5])->assertStatus(422);
        $this->assertSame(0, MarketingClaimDeduction::count());
    }

    public function test_the_invoice_fields_are_validated(): void
    {
        $c = $this->claim();
        $this->actAs($this->user('supervisor'));

        $this->postInvoice($c->id, ['invoice_number' => ''])->assertStatus(422);
        $this->postInvoice($c->id, ['invoice_total' => 0])->assertStatus(422);
        $this->postInvoice($c->id, ['invoice_total' => -100])->assertStatus(422);
        $this->postInvoice($c->id, ['invoice_date' => 'bukan-tanggal'])->assertStatus(422);
        $this->assertSame(0, MarketingClaimDeduction::count());
    }

    public function test_one_claim_can_be_deducted_from_many_invoices_until_the_balance_is_gone(): void
    {
        $c = $this->claim();
        $this->actAs($this->user('supervisor'));

        $this->postInvoice($c->id, ['invoice_number' => 'INV-001', 'invoice_total' => 4000])->assertStatus(201);
        $this->postInvoice($c->id, ['invoice_number' => 'INV-002', 'invoice_total' => 3000])->assertStatus(201);
        $last = $this->postInvoice($c->id, ['invoice_number' => 'INV-003', 'invoice_total' => 8000])->assertStatus(201); // hanya sisa 3.000 yang terpakai

        $rows = $last->json('data.deductions');
        $this->assertSame(['INV-001', 'INV-002', 'INV-003'], array_column($rows, 'invoice_number'));
        $this->assertEquals([4000, 3000, 3000], array_column($rows, 'claim_amount_used'));
        $this->assertEquals([10000, 6000, 3000], array_column($rows, 'balance_before'));
        $this->assertEquals([6000, 3000, 0], array_column($rows, 'balance_after'));
        $this->assertEquals(10000, $last->json('data.used_total'));
        $this->assertEquals(0, $last->json('data.balance'));

        $this->postInvoice($c->id, ['invoice_number' => 'INV-004', 'invoice_total' => 1000])->assertStatus(422); // saldo habis
        $this->assertSame(3, MarketingClaimDeduction::count());
        $this->assertCount(0, $this->getJson('/api/v1/marketing/deduction-claims')->json('data'));
    }

    public function test_the_same_invoice_cannot_be_deducted_twice_by_the_same_claim(): void
    {
        $c = $this->claim();
        $this->actAs($this->user('supervisor'));
        $this->postInvoice($c->id, ['invoice_number' => 'INV-001', 'invoice_total' => 2000])->assertStatus(201);

        $this->postInvoice($c->id, ['invoice_number' => 'INV-001', 'invoice_total' => 2000])->assertStatus(422);
        $this->postInvoice($c->id, ['invoice_number' => ' INV-001 ', 'invoice_total' => 2000])->assertStatus(422);
        $this->assertSame(1, MarketingClaimDeduction::count());
    }

    public function test_the_detail_shows_the_balance_and_the_history_with_who_posted(): void
    {
        $c = $this->claim();
        $poster = $this->actAs($this->user('supervisor', ['name' => 'Bu Sales Manager']));
        $this->postInvoice($c->id, ['invoice_number' => 'INV-001', 'invoice_total' => 4000])->assertStatus(201);

        $r = $this->getJson("/api/v1/marketing/deduction-claims/{$c->id}")->assertOk();

        $this->assertSame($c->claim_no, $r->json('data.claim_no'));
        $this->assertEquals(10000, $r->json('data.approved_amount'));
        $this->assertEquals(4000, $r->json('data.used_total'));
        $this->assertEquals(6000, $r->json('data.balance'));
        $this->assertSame($poster->name, $r->json('data.deductions.0.poster.name'));
        $this->assertSame('Distributor 1', $r->json('data.customer.name'));
    }

    public function test_only_approved_potong_nota_claims_are_available(): void
    {
        $transfer = $this->claim(null, ['payout_method' => 'TRANSFER']);
        $pending = $this->claim(null, ['status' => 'IN_APPROVAL']);
        $this->actAs($this->user('supervisor'));

        foreach ([$transfer, $pending] as $c) {
            $this->getJson("/api/v1/marketing/deduction-claims/{$c->id}")->assertStatus(404);
            $this->postInvoice($c->id)->assertStatus(404);
        }
        $this->getJson('/api/v1/marketing/deduction-claims/999')->assertStatus(404);
        $this->assertSame(0, MarketingClaimDeduction::count());
    }

    public function test_sales_only_sees_and_deducts_claims_of_their_own_distributors(): void
    {
        $mine = $this->user('sales');
        $other = $this->user('sales');
        $myClaim = $this->claim($mine);
        $otherClaim = $this->claim($other);

        $this->actAs($mine);
        $list = $this->getJson('/api/v1/marketing/deduction-claims')->assertOk();
        $this->assertSame([$myClaim->id], array_column($list->json('data'), 'id'));
        $this->getJson("/api/v1/marketing/deduction-claims/{$otherClaim->id}")->assertStatus(404);
        $this->postInvoice($otherClaim->id)->assertStatus(404);
        $this->postInvoice($myClaim->id, ['invoice_total' => 4000])->assertStatus(201);

        $this->actAs($this->user('supervisor'));
        $this->assertEqualsCanonicalizing([$myClaim->id, $otherClaim->id], array_column($this->getJson('/api/v1/marketing/deduction-claims')->json('data'), 'id'));
        $this->actAs($this->user('admin'));
        $this->getJson("/api/v1/marketing/deduction-claims/{$otherClaim->id}")->assertOk();
    }

    public function test_the_allowed_roles_come_from_the_config(): void
    {
        $c = $this->claim();

        foreach (['finance', 'warehouse'] as $role) {
            $this->actAs($this->user($role));
            $this->getJson('/api/v1/marketing/deduction-claims')->assertStatus(403);
            $this->getJson("/api/v1/marketing/deduction-claims/{$c->id}")->assertStatus(403);
            $this->postInvoice($c->id)->assertStatus(403);
        }

        config(['marketing.claim_deduction.roles' => ['finance']]);
        $this->actAs($this->user('finance'));
        $this->getJson('/api/v1/marketing/deduction-claims')->assertOk();
        $this->actAs($this->user('sales'));
        $this->getJson('/api/v1/marketing/deduction-claims')->assertStatus(403);
        $this->assertSame(0, MarketingClaimDeduction::count());
    }

    public function test_every_posting_is_written_to_the_audit_log(): void
    {
        $c = $this->claim();
        $this->actAs($this->user('supervisor'));
        $this->postInvoice($c->id, ['invoice_number' => 'INV-001', 'invoice_total' => 4000])->assertStatus(201);
        $this->postInvoice($c->id, ['invoice_number' => 'INV-002', 'invoice_total' => 2000])->assertStatus(201);

        $this->assertSame(2, AuditLog::where('action', 'marketing_claim.deduction')->where('entity_id', $c->id)->count());
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/marketing/deduction-claims')->assertStatus(401);
        $this->getJson('/api/v1/marketing/deduction-claims/1')->assertStatus(401);
        $this->postJson('/api/v1/marketing/deduction-claims/1/post-invoice', [])->assertStatus(401);
    }
}