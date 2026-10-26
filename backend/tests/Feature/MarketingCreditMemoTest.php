<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingClaim;
use App\Models\MarketingClaimCreditMemo;
use App\Models\MarketingEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.11 / MKT11: Metode Pencairan Program, Potong Tagihan (credit memo). */
class MarketingCreditMemoTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function user(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(string $role, array $attrs = []): User
    {
        $u = $this->user($role, $attrs);
        Sanctum::actingAs($u);

        return $u;
    }

    private function program(): MarketingEvent
    {
        if ($existing = MarketingEvent::where('activity_type', 'KLAIM')->first()) {
            return $existing;
        }
        $this->actAs('admin');
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

    /** Klaim yang sudah disetujui (Nilai Klaim Disetujui Rp 10.000) dengan metode Potong Tagihan. */
    private function claim(array $over = []): MarketingClaim
    {
        $program = $this->program();
        $this->seq++;
        $distributor = Customer::create(['customer_code' => 'DIST'.$this->seq, 'name' => 'Distributor '.$this->seq, 'city' => 'Surabaya', 'active' => true]);

        return MarketingClaim::create($over + [
            'claim_no' => 'CLM-2026-'.str_pad((string) $this->seq, 5, '0', STR_PAD_LEFT),
            'marketing_event_id' => $program->id, 'customer_id' => $distributor->id, 'letter_received_date' => '2026-12-10',
            'claimed_amount' => 12000, 'eligible_amount' => 10000, 'difference_amount' => 2000, 'status' => 'APPROVED',
            'approved_amount' => 10000, 'payout_method' => 'POTONG_TAGIHAN', 'approval_stage' => 4,
        ]);
    }

    private function url(int $id, string $action = ''): string
    {
        return "/api/v1/marketing/credit-memo-claims/{$id}".($action ? "/{$action}" : '');
    }

    private function enter(int $id, array $over = [])
    {
        return $this->postJson($this->url($id, 'entry'), $over + ['invoice_number' => 'INV-LAMA-001']);
    }

    private function postMemo(int $id, array $over = [])
    {
        return $this->postJson($this->url($id, 'post'), $over + ['credit_memo_number' => 'CM-001']);
    }

    private function applyMemo(int $id)
    {
        return $this->postJson($this->url($id, 'apply'));
    }

    public function test_the_list_only_has_approved_potong_tagihan_claims_whose_credit_memo_is_not_applied_yet(): void
    {
        $open = $this->claim();
        $this->claim(['payout_method' => 'POTONG_NOTA']);
        $this->claim(['payout_method' => 'TRANSFER']);
        $this->claim(['status' => 'IN_APPROVAL']);
        $done = $this->claim();
        $this->actAs('finance');
        $this->enter($done->id)->assertOk();
        $this->postMemo($done->id, ['credit_memo_number' => 'CM-DONE'])->assertOk();
        $this->applyMemo($done->id)->assertOk();

        $r = $this->getJson('/api/v1/marketing/credit-memo-claims')->assertOk();

        $this->assertSame([$open->id], array_column($r->json('data'), 'id'));
        $this->assertNull($r->json('data.0.credit_memo_status'));
        $this->assertEquals(10000, $r->json('data.0.balance'));
        $this->assertCount(1, $this->getJson('/api/v1/marketing/credit-memo-claims?q='.$open->claim_no)->json('data'));
        $this->assertCount(0, $this->getJson('/api/v1/marketing/credit-memo-claims?q=tidak-ada')->json('data'));
    }

    public function test_the_entry_credits_exactly_the_approved_value_with_the_claim_code_as_reference(): void
    {
        $c = $this->claim();
        $this->actAs('finance', ['name' => 'Bu Finance']);

        $r = $this->enter($c->id, ['invoice_number' => ' INV-LAMA-001 ', 'credit_value' => 999999, 'reference' => 'DIKETIK-SENDIRI'])->assertOk();

        $memo = $r->json('data.credit_memo');
        $this->assertSame('ENTERED', $memo['status']);
        $this->assertSame('INV-LAMA-001', $memo['invoice_number']);
        $this->assertEquals(10000, $memo['credit_value']);          // selalu sebesar klaim yang disetujui
        $this->assertSame($c->claim_no, $memo['reference']);          // selalu kode klaim
        $this->assertFalse($memo['tax_applies']);
        $this->assertNull($memo['tax_type']);
        $this->assertNull($memo['credit_memo_number']);
        $this->assertSame('Bu Finance', $memo['enterer']['name']);
        $this->assertTrue($r->json('data.flags.can_post'));
        $this->assertFalse($r->json('data.flags.can_apply'));
        $this->assertEquals(10000, $r->json('data.balance')); // saldo baru berkurang saat Apply
    }

    public function test_pph_requires_a_tax_type_chosen_from_the_distributors_status(): void
    {
        $c = $this->claim();
        $this->actAs('finance');

        $this->enter($c->id, ['tax_applies' => true])->assertStatus(422);
        $this->enter($c->id, ['tax_applies' => true, 'tax_type' => 'PPH_LAINNYA'])->assertStatus(422);
        $this->assertSame(0, MarketingClaimCreditMemo::count());

        $badan = $this->enter($c->id, ['tax_applies' => true, 'tax_type' => 'PPH_BADAN'])->assertOk();
        $this->assertTrue($badan->json('data.credit_memo.tax_applies'));
        $this->assertSame('PPH_BADAN', $badan->json('data.credit_memo.tax_type'));
        $this->assertSame('PPh Badan', $badan->json('data.credit_memo.tax_type_label'));

        $pribadi = $this->enter($c->id, ['tax_applies' => true, 'tax_type' => 'PPH_PRIBADI'])->assertOk();
        $this->assertSame('PPh Pribadi', $pribadi->json('data.credit_memo.tax_type_label'));

        $none = $this->enter($c->id, ['tax_applies' => false, 'tax_type' => 'PPH_BADAN'])->assertOk(); // tanpa PPh: jenis pajak dikosongkan
        $this->assertFalse($none->json('data.credit_memo.tax_applies'));
        $this->assertNull($none->json('data.credit_memo.tax_type'));
        $this->assertSame(1, MarketingClaimCreditMemo::count()); // satu klaim, satu credit memo
    }

    public function test_the_entry_can_be_changed_until_the_credit_memo_is_posted(): void
    {
        $c = $this->claim();
        $this->actAs('finance');
        $this->enter($c->id, ['invoice_number' => 'INV-LAMA-001'])->assertOk();

        $changed = $this->enter($c->id, ['invoice_number' => 'INV-LAMA-002'])->assertOk();
        $this->assertSame('INV-LAMA-002', $changed->json('data.credit_memo.invoice_number'));

        $this->enter($c->id, ['invoice_number' => ''])->assertStatus(422);
        $this->postMemo($c->id)->assertOk();
        $this->enter($c->id, ['invoice_number' => 'INV-LAMA-003'])->assertStatus(422);
        $this->assertSame('INV-LAMA-002', MarketingClaimCreditMemo::first()->invoice_number);
    }

    public function test_check_and_post_needs_an_entry_and_a_unique_credit_memo_number(): void
    {
        $a = $this->claim();
        $b = $this->claim();
        $this->actAs('finance');

        $this->postMemo($a->id)->assertStatus(422); // belum ada entry

        $this->enter($a->id)->assertOk();
        $this->postJson($this->url($a->id, 'post'), [])->assertStatus(422); // nomor wajib diisi

        $r = $this->postMemo($a->id, ['credit_memo_number' => ' CM-001 '])->assertOk();
        $this->assertSame('POSTED', $r->json('data.credit_memo.status'));
        $this->assertSame('CM-001', $r->json('data.credit_memo.credit_memo_number'));
        $this->assertNotNull($r->json('data.credit_memo.posted_at'));
        $this->assertTrue($r->json('data.flags.can_apply'));
        $this->assertEquals(10000, $r->json('data.balance')); // belum di-Apply

        $this->postMemo($a->id, ['credit_memo_number' => 'CM-002'])->assertStatus(422); // sudah di-Post

        $this->enter($b->id)->assertOk();
        $this->postMemo($b->id, ['credit_memo_number' => 'CM-001'])->assertStatus(422); // nomor dipakai klaim lain
        $this->postMemo($b->id, ['credit_memo_number' => 'CM-003'])->assertOk();
    }

    public function test_apply_reduces_the_claim_balance_and_closes_the_claim(): void
    {
        $c = $this->claim();
        $this->actAs('finance');
        $this->applyMemo($c->id)->assertStatus(422); // belum ada credit memo
        $this->enter($c->id)->assertOk();
        $this->applyMemo($c->id)->assertStatus(422); // belum di-Post
        $this->postMemo($c->id)->assertOk();

        $r = $this->applyMemo($c->id)->assertOk();

        $this->assertSame('APPLIED', $r->json('data.credit_memo.status'));
        $this->assertEquals(0, $r->json('data.balance')); // sisa saldo klaim berkurang
        $this->assertFalse($r->json('data.flags.can_entry'));
        $this->assertFalse($r->json('data.flags.can_post'));
        $this->assertFalse($r->json('data.flags.can_apply'));
        $this->assertCount(0, $this->getJson('/api/v1/marketing/credit-memo-claims')->json('data'));

        $this->applyMemo($c->id)->assertStatus(422);
        $this->postMemo($c->id, ['credit_memo_number' => 'CM-NEW'])->assertStatus(422);
        $this->enter($c->id, ['invoice_number' => 'INV-BARU'])->assertStatus(422);
    }

    public function test_the_detail_shows_every_step_with_who_did_it(): void
    {
        $c = $this->claim();
        $this->actAs('finance', ['name' => 'Bu Finance']);
        $this->enter($c->id, ['tax_applies' => true, 'tax_type' => 'PPH_PRIBADI'])->assertOk();
        $this->postMemo($c->id)->assertOk();
        $this->applyMemo($c->id)->assertOk();

        $r = $this->getJson($this->url($c->id))->assertOk();

        $this->assertSame($c->claim_no, $r->json('data.claim_no'));
        $this->assertSame('Distributor 1', $r->json('data.customer.name'));
        $this->assertSame('APPLIED', $r->json('data.credit_memo_status'));
        $this->assertSame(['Bu Finance', 'Bu Finance', 'Bu Finance'], [
            $r->json('data.credit_memo.enterer.name'), $r->json('data.credit_memo.poster.name'), $r->json('data.credit_memo.applier.name'),
        ]);
        $this->assertSame(['PPH_BADAN', 'PPH_PRIBADI'], array_column($r->json('data.flags.tax_types'), 'value'));
    }

    public function test_only_approved_potong_tagihan_claims_can_be_worked_on(): void
    {
        $nota = $this->claim(['payout_method' => 'POTONG_NOTA']);
        $pending = $this->claim(['status' => 'IN_APPROVAL']);
        $this->actAs('finance');

        foreach ([$nota, $pending] as $c) {
            $this->getJson($this->url($c->id))->assertStatus(404);
            $this->enter($c->id)->assertStatus(404);
            $this->postMemo($c->id)->assertStatus(404);
            $this->applyMemo($c->id)->assertStatus(404);
        }
        $this->getJson($this->url(999))->assertStatus(404);
        $this->assertSame(0, MarketingClaimCreditMemo::count());
    }

    public function test_finance_and_admin_can_work_on_credit_memos_but_other_roles_cannot(): void
    {
        $c = $this->claim();

        foreach (['sales', 'supervisor', 'warehouse'] as $role) {
            $this->actAs($role);
            $this->getJson('/api/v1/marketing/credit-memo-claims')->assertStatus(403);
            $this->getJson($this->url($c->id))->assertStatus(403);
            $this->enter($c->id)->assertStatus(403);
            $this->postMemo($c->id)->assertStatus(403);
            $this->applyMemo($c->id)->assertStatus(403);
        }
        $this->assertSame(0, MarketingClaimCreditMemo::count());

        $this->actAs('admin');
        $this->enter($c->id)->assertOk();

        config(['marketing.credit_memo.roles' => ['supervisor']]);
        $this->actAs('supervisor');
        $this->postMemo($c->id)->assertOk();
        $this->actAs('finance');
        $this->applyMemo($c->id)->assertStatus(403);
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        $c = $this->claim();
        $this->actAs('finance');
        $this->enter($c->id)->assertOk();
        $this->postMemo($c->id)->assertOk();
        $this->applyMemo($c->id)->assertOk();

        foreach (['credit_memo_entry', 'credit_memo_post', 'credit_memo_apply'] as $step) {
            $this->assertTrue(AuditLog::where('action', "marketing_claim.{$step}")->where('entity_id', $c->id)->exists(), $step);
        }
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/marketing/credit-memo-claims')->assertStatus(401);
        $this->getJson('/api/v1/marketing/credit-memo-claims/1')->assertStatus(401);
        $this->postJson('/api/v1/marketing/credit-memo-claims/1/entry', [])->assertStatus(401);
        $this->postJson('/api/v1/marketing/credit-memo-claims/1/post', [])->assertStatus(401);
        $this->postJson('/api/v1/marketing/credit-memo-claims/1/apply')->assertStatus(401);
    }
}