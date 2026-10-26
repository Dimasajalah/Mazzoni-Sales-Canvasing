<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingClaim;
use App\Models\MarketingClaimTransfer;
use App\Models\MarketingEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.12 / MKT12: Metode Pencairan Program, Transfer. */
class MarketingTransferTest extends TestCase
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

    /** Klaim yang sudah disetujui (Nilai Klaim Disetujui Rp 10.000) dengan metode Transfer. */
    private function claim(array $over = []): MarketingClaim
    {
        $program = $this->program();
        $this->seq++;
        $distributor = Customer::create(['customer_code' => 'DIST'.$this->seq, 'name' => 'Distributor '.$this->seq, 'city' => 'Surabaya', 'active' => true]);

        return MarketingClaim::create($over + [
            'claim_no' => 'CLM-2026-'.str_pad((string) $this->seq, 5, '0', STR_PAD_LEFT),
            'marketing_event_id' => $program->id, 'customer_id' => $distributor->id, 'letter_received_date' => '2026-12-10',
            'claimed_amount' => 12000, 'eligible_amount' => 10000, 'difference_amount' => 2000, 'status' => 'APPROVED',
            'approved_amount' => 10000, 'payout_method' => 'TRANSFER', 'approval_stage' => 4,
        ]);
    }

    private function url(int $id, string $action = ''): string
    {
        return "/api/v1/marketing/transfer-claims/{$id}".($action ? "/{$action}" : '');
    }

    /** Rekening perusahaan (bukan perorangan), distributor Non-PKP, kecuali diubah. */
    private function entryPayload(array $over = []): array
    {
        return $over + ['bank_name' => 'BCA', 'account_number' => '123-456-7890', 'account_name' => 'PT Distributor Makmur', 'is_individual' => false, 'is_pkp' => false];
    }

    private function enterTransfer(int $id, array $over = [])
    {
        return $this->postJson($this->url($id, 'entry'), $this->entryPayload($over));
    }

    private function markDone(int $id, array $over = [])
    {
        return $this->postJson($this->url($id, 'transferred'), $over + ['transfer_reference' => 'TRF-001', 'transferred_on' => now()->toDateString()]);
    }

    public function test_the_list_only_has_approved_transfer_claims_not_yet_disbursed(): void
    {
        $open = $this->claim();
        $this->claim(['payout_method' => 'POTONG_NOTA']);
        $this->claim(['payout_method' => 'POTONG_TAGIHAN']);
        $this->claim(['status' => 'IN_APPROVAL']);
        $this->claim(['status' => 'DISBURSED']);
        $this->actAs('finance');

        $r = $this->getJson('/api/v1/marketing/transfer-claims')->assertOk();

        $this->assertSame([$open->id], array_column($r->json('data'), 'id'));
        $this->assertNull($r->json('data.0.transfer_status'));
        $this->assertCount(1, $this->getJson('/api/v1/marketing/transfer-claims?q='.$open->claim_no)->json('data'));
        $this->assertCount(0, $this->getJson('/api/v1/marketing/transfer-claims?q=tidak-ada')->json('data'));
    }

    public function test_a_company_account_of_a_pkp_distributor_gets_pph_23_at_2_percent(): void
    {
        $c = $this->claim();
        $this->actAs('finance');

        $t = $this->enterTransfer($c->id, ['is_individual' => false, 'is_pkp' => true])->assertOk()->json('data.transfer');

        $this->assertSame('PPH_23', $t['tax_type']);
        $this->assertSame('PPh 23', $t['tax_type_label']);
        $this->assertEquals(2, $t['tax_rate']);
        $this->assertEquals(10000, $t['gross_amount']);
        $this->assertEquals(200, $t['tax_amount']);
        $this->assertEquals(9800, $t['net_amount']);
        $this->assertTrue($t['is_pkp']);
    }

    public function test_a_company_account_of_a_non_pkp_distributor_gets_pph_23_at_4_percent(): void
    {
        $c = $this->claim();
        $this->actAs('finance');

        $t = $this->enterTransfer($c->id, ['is_individual' => false, 'is_pkp' => false])->assertOk()->json('data.transfer');

        $this->assertSame('PPH_23', $t['tax_type']);
        $this->assertEquals(4, $t['tax_rate']);
        $this->assertEquals(400, $t['tax_amount']);
        $this->assertEquals(9600, $t['net_amount']);
    }

    public function test_an_individual_account_gets_pph_21_at_2_5_percent_whatever_the_pkp_status(): void
    {
        $c = $this->claim();
        $this->actAs('finance');

        $t = $this->enterTransfer($c->id, ['is_individual' => true, 'is_pkp' => true, 'tax_id_type' => 'KTP', 'tax_id_number' => '3578010101900001'])->assertOk()->json('data.transfer');

        $this->assertSame('PPH_21', $t['tax_type']);
        $this->assertSame('PPh 21', $t['tax_type_label']);
        $this->assertEquals(2.5, $t['tax_rate']);
        $this->assertEquals(250, $t['tax_amount']);
        $this->assertEquals(9750, $t['net_amount']);
        $this->assertSame('KTP', $t['tax_id_type']);
        $this->assertSame('3578010101900001', $t['tax_id_number']);
    }

    public function test_an_individual_account_needs_the_npwp_or_ktp_basis_and_a_company_account_clears_it(): void
    {
        $c = $this->claim();
        $this->actAs('finance');

        $this->enterTransfer($c->id, ['is_individual' => true])->assertStatus(422);                                          // dasar belum dipilih
        $this->enterTransfer($c->id, ['is_individual' => true, 'tax_id_type' => 'SIM', 'tax_id_number' => '1'])->assertStatus(422); // dasar tidak dikenal
        $this->enterTransfer($c->id, ['is_individual' => true, 'tax_id_type' => 'NPWP'])->assertStatus(422);                // nomor kosong
        $this->assertSame(0, MarketingClaimTransfer::count());

        $this->enterTransfer($c->id, ['is_individual' => true, 'tax_id_type' => 'NPWP', 'tax_id_number' => '09.254.294.3-407.000'])->assertOk();
        $company = $this->enterTransfer($c->id, ['is_individual' => false, 'tax_id_type' => 'NPWP', 'tax_id_number' => '09.254.294.3-407.000'])->assertOk()->json('data.transfer');

        $this->assertSame('PPH_23', $company['tax_type']);
        $this->assertNull($company['tax_id_type']);    // bukan perorangan: dasar NPWP atau KTP tidak dipakai
        $this->assertNull($company['tax_id_number']);
        $this->assertSame(1, MarketingClaimTransfer::count()); // satu klaim, satu pencairan transfer
    }

    public function test_the_amounts_are_computed_by_the_system_and_cannot_be_typed(): void
    {
        $c = $this->claim();
        $this->actAs('finance');

        $t = $this->enterTransfer($c->id, ['gross_amount' => 999999, 'tax_amount' => 1, 'net_amount' => 999999, 'tax_rate' => 0, 'tax_type' => 'PPH_21'])->assertOk()->json('data.transfer');

        $this->assertEquals(10000, $t['gross_amount']);
        $this->assertSame('PPH_23', $t['tax_type']);
        $this->assertEquals(400, $t['tax_amount']);
        $this->assertEquals(9600, $t['net_amount']);
    }

    public function test_the_destination_account_fields_are_validated(): void
    {
        $c = $this->claim();
        $this->actAs('finance');

        $this->enterTransfer($c->id, ['bank_name' => ''])->assertStatus(422);
        $this->enterTransfer($c->id, ['account_number' => ''])->assertStatus(422);
        $this->enterTransfer($c->id, ['account_number' => 'abc-123'])->assertStatus(422);
        $this->enterTransfer($c->id, ['account_name' => ''])->assertStatus(422);
        $this->postJson($this->url($c->id, 'entry'), ['bank_name' => 'BCA', 'account_number' => '123', 'account_name' => 'PT X'])->assertStatus(422); // jenis rekening wajib
        $this->assertSame(0, MarketingClaimTransfer::count());

        $this->enterTransfer($c->id, ['account_number' => '0123 456-789'])->assertOk(); // angka, spasi, dan tanda hubung diperbolehkan
    }

    public function test_the_entry_can_be_changed_until_the_funds_are_transferred(): void
    {
        $c = $this->claim();
        $this->actAs('finance');
        $first = $this->enterTransfer($c->id, ['is_pkp' => false])->assertOk();
        $this->assertTrue($first->json('data.flags.can_entry'));
        $this->assertTrue($first->json('data.flags.can_transfer'));

        $changed = $this->enterTransfer($c->id, ['bank_name' => 'Mandiri', 'is_pkp' => true])->assertOk()->json('data.transfer');
        $this->assertSame('Mandiri', $changed['bank_name']);
        $this->assertEquals(2, $changed['tax_rate']);

        $this->markDone($c->id)->assertOk();
        $this->enterTransfer($c->id, ['bank_name' => 'BNI'])->assertStatus(422); // klaim sudah Dicairkan
        $this->assertSame('Mandiri', MarketingClaimTransfer::first()->bank_name);
    }

    public function test_marking_the_claim_disbursed_needs_an_entry_and_a_unique_reference(): void
    {
        $a = $this->claim();
        $b = $this->claim();
        $this->actAs('finance');

        $this->markDone($a->id)->assertStatus(422); // belum ada entry

        $this->enterTransfer($a->id)->assertOk();
        $this->postJson($this->url($a->id, 'transferred'), ['transferred_on' => now()->toDateString()])->assertStatus(422);              // nomor referensi wajib
        $this->postJson($this->url($a->id, 'transferred'), ['transfer_reference' => 'TRF-001'])->assertStatus(422);                       // tanggal wajib
        $this->markDone($a->id, ['transferred_on' => now()->addDays(10)->toDateString()])->assertStatus(422);                             // tanggal terlalu jauh ke depan
        $this->markDone($a->id, ['transferred_on' => 'bukan-tanggal'])->assertStatus(422);

        $r = $this->markDone($a->id, ['transfer_reference' => ' TRF-001 ', 'transferred_on' => now()->addDay()->toDateString()])->assertOk(); // besok masih diterima (selisih zona waktu)

        $this->assertSame('DISBURSED', $r->json('data.status'));
        $this->assertSame('TRANSFERRED', $r->json('data.transfer_status'));
        $this->assertSame('TRF-001', $r->json('data.transfer.transfer_reference'));
        $this->assertFalse($r->json('data.flags.can_entry'));
        $this->assertFalse($r->json('data.flags.can_transfer'));
        $this->markDone($a->id, ['transfer_reference' => 'TRF-002'])->assertStatus(422); // tidak bisa dicairkan dua kali

        $this->enterTransfer($b->id)->assertOk();
        $this->markDone($b->id, ['transfer_reference' => 'TRF-001'])->assertStatus(422); // nomor dipakai klaim lain
        $this->markDone($b->id, ['transfer_reference' => 'TRF-003'])->assertOk();
    }

    public function test_a_disbursed_claim_leaves_the_list_but_its_detail_stays_viewable(): void
    {
        $c = $this->claim();
        $this->actAs('finance', ['name' => 'Bu Finance']);
        $this->enterTransfer($c->id)->assertOk();
        $this->markDone($c->id)->assertOk();

        $this->assertCount(0, $this->getJson('/api/v1/marketing/transfer-claims')->json('data'));

        $r = $this->getJson($this->url($c->id))->assertOk();
        $this->assertSame('DISBURSED', $r->json('data.status'));
        $this->assertSame('Distributor 1', $r->json('data.customer.name'));
        $this->assertSame('Bu Finance', $r->json('data.transfer.enterer.name'));
        $this->assertSame('Bu Finance', $r->json('data.transfer.transferer.name'));
        $this->assertSame(['NPWP', 'KTP'], array_column($r->json('data.flags.tax_id_types'), 'value'));
        $this->assertEquals(2.5, $r->json('data.flags.rates.pph21'));
        $this->assertEquals(2, $r->json('data.flags.rates.pph23_pkp'));
        $this->assertEquals(4, $r->json('data.flags.rates.pph23_non_pkp'));
    }

    public function test_a_disbursed_claim_can_no_longer_be_calculated_or_submitted(): void
    {
        $c = $this->claim();
        $this->actAs('finance');
        $this->enterTransfer($c->id)->assertOk();
        $this->markDone($c->id)->assertOk();

        $this->actAs('admin');
        $this->postJson("/api/v1/marketing/claims/{$c->id}/calculate")->assertStatus(422);
        $this->postJson("/api/v1/marketing/claims/{$c->id}/submit", ['payout_method' => 'POTONG_NOTA'])->assertStatus(422);
        $this->assertSame('TRANSFER', MarketingClaim::find($c->id)->payout_method);
    }

    public function test_only_approved_transfer_claims_can_be_worked_on(): void
    {
        $nota = $this->claim(['payout_method' => 'POTONG_NOTA']);
        $pending = $this->claim(['status' => 'IN_APPROVAL']);
        $this->actAs('finance');

        foreach ([$nota, $pending] as $c) {
            $this->getJson($this->url($c->id))->assertStatus(404);
            $this->enterTransfer($c->id)->assertStatus(404);
            $this->markDone($c->id)->assertStatus(404);
        }
        $this->getJson($this->url(999))->assertStatus(404);
        $this->assertSame(0, MarketingClaimTransfer::count());
    }

    public function test_finance_and_admin_can_disburse_but_other_roles_cannot(): void
    {
        $c = $this->claim();

        foreach (['sales', 'supervisor', 'warehouse'] as $role) {
            $this->actAs($role);
            $this->getJson('/api/v1/marketing/transfer-claims')->assertStatus(403);
            $this->getJson($this->url($c->id))->assertStatus(403);
            $this->enterTransfer($c->id)->assertStatus(403);
            $this->markDone($c->id)->assertStatus(403);
        }
        $this->assertSame(0, MarketingClaimTransfer::count());

        $this->actAs('admin');
        $this->enterTransfer($c->id)->assertOk();

        config(['marketing.transfer.roles' => ['supervisor']]);
        $this->actAs('supervisor');
        $this->markDone($c->id)->assertOk();
        $this->actAs('finance');
        $this->getJson('/api/v1/marketing/transfer-claims')->assertStatus(403);
    }

    public function test_the_tax_rates_come_from_the_config(): void
    {
        config(['marketing.transfer.pph21_rate' => 3.0, 'marketing.transfer.pph23_non_pkp_rate' => 5.0]);
        $a = $this->claim();
        $b = $this->claim();
        $this->actAs('finance');

        $this->assertEquals(300, $this->enterTransfer($a->id, ['is_individual' => true, 'tax_id_type' => 'KTP', 'tax_id_number' => '1'])->json('data.transfer.tax_amount'));
        $this->assertEquals(500, $this->enterTransfer($b->id, ['is_individual' => false, 'is_pkp' => false])->json('data.transfer.tax_amount'));
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        $c = $this->claim();
        $this->actAs('finance');
        $this->enterTransfer($c->id)->assertOk();
        $this->markDone($c->id)->assertOk();

        $this->assertTrue(AuditLog::where('action', 'marketing_claim.transfer_entry')->where('entity_id', $c->id)->exists());
        $this->assertTrue(AuditLog::where('action', 'marketing_claim.transfer_done')->where('entity_id', $c->id)->exists());
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/marketing/transfer-claims')->assertStatus(401);
        $this->getJson('/api/v1/marketing/transfer-claims/1')->assertStatus(401);
        $this->postJson('/api/v1/marketing/transfer-claims/1/entry', [])->assertStatus(401);
        $this->postJson('/api/v1/marketing/transfer-claims/1/transferred', [])->assertStatus(401);
    }
}