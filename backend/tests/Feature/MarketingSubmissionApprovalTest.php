<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingClaim;
use App\Models\MarketingClaimApproval;
use App\Models\MarketingEvent;
use App\Models\MarketingSelloutRow;
use App\Models\MarketingSelloutUpload;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.9 / MKT09: Approval Pengajuan Program Klaim. */
class MarketingSubmissionApprovalTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(string $role): User
    {
        $u = $this->user($role);
        Sanctum::actingAs($u);

        return $u;
    }

    /** Pengajuan klaim yang sudah dihitung dan diajukan (status SUBMITTED): eligible Rp 10.000, nilai pengajuan Rp 12.000. */
    private function submitted(): MarketingClaim
    {
        $this->actAs('admin');
        foreach (['D1', 'D2'] as $code) {
            Customer::firstOrCreate(['customer_code' => $code], ['name' => "Distributor {$code}", 'active' => true]);
        }
        $budget = MarketingBudget::first() ?? MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 100000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        $programId = $this->postJson('/api/v1/marketing/claim-programs', [
            'marketing_budget_id' => $budget->id, 'description' => 'Diskon Saus Q4', 'reference_letter_no' => 'SKP/'.uniqid(),
            'claim_type' => 'DISKON_PRODUK', 'claim_source' => 'SELL_OUT', 'claim_basis' => 'SALES_VALUE', 'claim_rate_type' => 'PERCENT',
            'claim_rate' => 2.5, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'claim_deadline' => '2026-12-15',
            'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201)->json('data.id');
        MarketingEvent::whereKey($programId)->update(['status' => 'APPROVED']);

        $upload = MarketingSelloutUpload::create(['marketing_event_id' => $programId, 'filename' => 'x.csv', 'status' => 'VALID', 'total_rows' => 1]);
        MarketingSelloutRow::insert([[
            'upload_id' => $upload->id, 'row_no' => 2, 'sale_date' => '2026-11-10', 'customer_code' => 'D1', 'salesperson_code' => 'S1',
            'part_num' => 'P1', 'qty' => 1, 'amount' => 400000,
        ]]);

        $id = $this->postJson('/api/v1/marketing/claims', [
            'program_id' => $programId, 'customer_id' => Customer::where('customer_code', 'D1')->value('id'),
            'letter_received_date' => '2026-12-10', 'claimed_amount' => 12000,
        ])->assertStatus(201)->json('data.id');
        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();
        $this->postJson("/api/v1/marketing/claims/{$id}/submit", ['payout_method' => 'TRANSFER'])->assertOk();

        return MarketingClaim::find($id);
    }

    private function url(int $id, string $action): string
    {
        return "/api/v1/marketing/claims/{$id}/{$action}";
    }

    private function approve(int $id, array $extra = [])
    {
        return $this->postJson($this->url($id, 'approve'), $extra + ['reason_code' => 'SESUAI_ANGGARAN']);
    }

    private function reject(int $id, array $extra = [])
    {
        return $this->postJson($this->url($id, 'reject'), $extra + ['reason_code' => 'DOKUMEN_KURANG']);
    }

    /** Konfirmasi selisih lalu approval tahap 1-3, sehingga klaim menunggu Direktur Sales (tahap 4). */
    private function toStage4(MarketingClaim $c): void
    {
        $this->actAs('supervisor');
        $this->postJson($this->url($c->id, 'confirm-difference'))->assertOk();
        $this->approve($c->id)->assertOk(); // tahap 1 Koordinator Marketing
        $this->approve($c->id)->assertOk(); // tahap 2 Manager Marketing
        $this->actAs('admin');
        $this->approve($c->id)->assertOk(); // tahap 3 Manager Accounting
    }

    public function test_a_submitted_claim_waits_for_the_difference_to_be_confirmed_to_the_distributor(): void
    {
        $c = $this->submitted();
        $this->actAs('supervisor');

        $r = $this->getJson("/api/v1/marketing/claims/{$c->id}")->assertOk();

        $this->assertSame('SUBMITTED', $r->json('data.status'));
        $this->assertTrue($r->json('data.flags.approval.can_confirm'));
        $this->assertFalse($r->json('data.flags.approval.can_act'));
        $this->assertSame(['Koordinator Marketing', 'Manager Marketing', 'Manager Accounting', 'Direktur Sales'], array_column($r->json('data.flags.approval.levels'), 'label'));
        $this->assertStringContainsString('konfirmasi selisih', $r->json('data.flags.approval.awaiting_label'));

        $this->actAs('admin');
        $this->assertFalse($this->getJson("/api/v1/marketing/claims/{$c->id}")->json('data.flags.approval.can_confirm'));
    }

    public function test_confirming_the_difference_starts_approval_at_stage_1(): void
    {
        $c = $this->submitted();
        $this->actAs('supervisor');

        $this->approve($c->id)->assertStatus(422); // belum dikonfirmasi

        $r = $this->postJson($this->url($c->id, 'confirm-difference'), ['notes' => 'Distributor setuju via telepon'])->assertOk();

        $this->assertSame('IN_APPROVAL', $r->json('data.status'));
        $this->assertSame(1, $r->json('data.approval_stage'));
        $this->assertSame('Distributor setuju via telepon', $r->json('data.diff_confirm_notes'));
        $this->assertNotNull($r->json('data.diff_confirmed_at'));
        $this->assertNotNull($r->json('data.diff_confirmer.name'));
        $this->postJson($this->url($c->id, 'confirm-difference'))->assertStatus(422); // tidak bisa dua kali
    }

    public function test_only_the_coordinator_confirms_the_difference(): void
    {
        $c = $this->submitted();
        $this->actAs('admin');

        $this->postJson($this->url($c->id, 'confirm-difference'))->assertStatus(403);
        $this->assertSame('SUBMITTED', MarketingClaim::find($c->id)->status);
    }

    public function test_four_approvals_in_order_leave_the_claim_waiting_for_the_final_amount(): void
    {
        $c = $this->submitted();
        $this->toStage4($c);
        $this->assertSame(4, MarketingClaim::find($c->id)->approval_stage);
        $this->assertSame('IN_APPROVAL', MarketingClaim::find($c->id)->status);

        $this->actAs('admin');
        $r = $this->approve($c->id)->assertOk(); // tahap 4 Direktur Sales

        $this->assertSame('AWAITING_AMOUNT', $r->json('data.status'));
        $this->assertSame([1, 2, 3, 4], array_column($r->json('data.approvals'), 'stage'));
        $this->assertSame(['Koordinator Marketing', 'Manager Marketing', 'Manager Accounting', 'Direktur Sales'], array_column($r->json('data.approvals'), 'stage_label'));
        $this->assertSame(['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED'], array_column($r->json('data.approvals'), 'action'));
        $this->assertSame('Sesuai anggaran', $r->json('data.approvals.0.reason_label'));
        $this->assertTrue($r->json('data.flags.approval.can_finalize'));
        $this->assertEquals(10000, $r->json('data.flags.approval.expected_amount'));
    }

    public function test_only_the_approver_of_the_current_stage_can_act(): void
    {
        $c = $this->submitted();
        $this->actAs('supervisor');
        $this->postJson($this->url($c->id, 'confirm-difference'))->assertOk();

        $this->actAs('admin'); // tahap 1 milik supervisor
        $this->approve($c->id)->assertStatus(403);
        $this->reject($c->id)->assertStatus(403);

        $this->actAs('supervisor');
        $this->approve($c->id)->assertOk();
        $this->approve($c->id)->assertOk();
        $this->approve($c->id)->assertStatus(403); // tahap 3 milik admin
        $this->assertSame(3, MarketingClaim::find($c->id)->approval_stage);
    }

    public function test_rejecting_at_any_stage_stops_the_claim(): void
    {
        $c = $this->submitted();
        $this->toStage4($c);
        $this->actAs('admin');

        $r = $this->reject($c->id, ['reason_code' => 'ANGGARAN_TIDAK_SESUAI', 'notes' => 'Selisih terlalu besar'])->assertOk();

        $this->assertSame('REJECTED', $r->json('data.status'));
        $this->assertSame('Anggaran tidak sesuai', $r->json('data.approvals.3.reason_label'));
        $this->approve($c->id)->assertStatus(422);
        $this->postJson($this->url($c->id, 'calculate'))->assertStatus(422);
        $this->postJson($this->url($c->id, 'submit'), ['payout_method' => 'BARANG'])->assertStatus(422);
    }

    public function test_a_reason_code_is_required_and_must_match_the_decision(): void
    {
        $c = $this->submitted();
        $this->actAs('supervisor');
        $this->postJson($this->url($c->id, 'confirm-difference'))->assertOk();

        $this->postJson($this->url($c->id, 'approve'), [])->assertStatus(422);
        $this->approve($c->id, ['reason_code' => 'DOKUMEN_KURANG'])->assertStatus(422);
        $this->reject($c->id, ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(422);
        $this->assertSame(0, MarketingClaimApproval::count());
    }

    public function test_direktur_sales_can_adjust_the_value_with_a_reason(): void
    {
        $c = $this->submitted();
        $this->toStage4($c);
        $this->actAs('admin');

        $r = $this->approve($c->id, ['adjusted_amount' => 8000, 'adjust_reason' => 'Ada retur yang belum dihitung'])->assertOk();

        $this->assertSame('AWAITING_AMOUNT', $r->json('data.status'));
        $this->assertEquals(8000, $r->json('data.adjusted_amount'));
        $this->assertSame('Ada retur yang belum dihitung', $r->json('data.adjust_reason'));
        $this->assertNotNull($r->json('data.adjuster.name'));
        $this->assertEquals(8000, $r->json('data.approvals.3.adjusted_amount'));
        $this->assertEquals(8000, $r->json('data.flags.approval.expected_amount'));
        $this->assertTrue($r->json('data.flags.approval.can_finalize'));
    }

    public function test_the_adjustment_rules_are_enforced(): void
    {
        $c = $this->submitted();
        $this->actAs('supervisor');
        $this->postJson($this->url($c->id, 'confirm-difference'))->assertOk();
        $this->approve($c->id, ['adjusted_amount' => 8000, 'adjust_reason' => 'Bukan hak tahap 1'])->assertStatus(422); // hanya Direktur Sales
        $this->approve($c->id)->assertOk();
        $this->approve($c->id)->assertOk();
        $this->actAs('admin');
        $this->approve($c->id)->assertOk();

        $this->approve($c->id, ['adjusted_amount' => 8000])->assertStatus(422);                                    // alasan wajib
        $this->approve($c->id, ['adjusted_amount' => 20000, 'adjust_reason' => 'Terlalu besar'])->assertStatus(422); // melebihi nilai pengajuan
        $this->approve($c->id, ['adjusted_amount' => 0, 'adjust_reason' => 'Nol'])->assertStatus(422);
        $this->assertSame('IN_APPROVAL', MarketingClaim::find($c->id)->status);
        $this->assertNull(MarketingClaim::find($c->id)->adjusted_amount);

        $reject = $this->reject($c->id, ['adjusted_amount' => 8000, 'adjust_reason' => 'Diabaikan saat menolak'])->assertOk();
        $this->assertSame('REJECTED', $reject->json('data.status'));
        $this->assertNull($reject->json('data.adjusted_amount')); // penyesuaian hanya berlaku bila menyetujui
    }

    public function test_marketing_confirms_the_final_approved_amount_which_must_match_the_approval_result(): void
    {
        $c = $this->submitted();
        $this->postJson($this->url($c->id, 'approved-amount'), ['amount' => 10000])->assertStatus(422); // belum waktunya
        $this->toStage4($c);
        $this->actAs('admin');
        $this->approve($c->id)->assertOk();

        $this->actAs('supervisor');
        $this->postJson($this->url($c->id, 'approved-amount'), ['amount' => 12000])->assertStatus(422); // bukan nilai eligible
        $this->postJson($this->url($c->id, 'approved-amount'), [])->assertStatus(422);

        $r = $this->postJson($this->url($c->id, 'approved-amount'), ['amount' => 10000])->assertOk();

        $this->assertSame('APPROVED', $r->json('data.status'));
        $this->assertEquals(10000, $r->json('data.approved_amount'));
        $this->assertNotNull($r->json('data.finalizer.name'));
        $this->postJson($this->url($c->id, 'approved-amount'), ['amount' => 10000])->assertStatus(422); // tidak bisa diubah lagi
    }

    public function test_after_an_adjustment_the_final_amount_must_equal_the_adjusted_value(): void
    {
        $c = $this->submitted();
        $this->toStage4($c);
        $this->actAs('admin');
        $this->approve($c->id, ['adjusted_amount' => 8000, 'adjust_reason' => 'Retur'])->assertOk();

        $this->postJson($this->url($c->id, 'approved-amount'), ['amount' => 10000])->assertStatus(422); // eligible tidak berlaku lagi
        $r = $this->postJson($this->url($c->id, 'approved-amount'), ['amount' => 8000])->assertOk();

        $this->assertEquals(8000, $r->json('data.approved_amount'));
        $this->assertSame('APPROVED', $r->json('data.status'));
    }

    public function test_the_pending_dashboard_lists_claims_waiting_for_me(): void
    {
        $c = $this->submitted();

        $this->actAs('supervisor');
        $mine = $this->getJson('/api/v1/marketing/approvals/pending')->assertOk();
        $this->assertSame(['PENGAJUAN'], array_column($mine->json('data'), 'kind'));
        $this->assertSame($c->claim_no, $mine->json('data.0.event_code'));
        $this->assertStringContainsString('Koordinator Marketing', $mine->json('data.0.awaiting_label'));
        $this->assertEquals(12000, $mine->json('data.0.budget_amount'));

        $this->actAs('admin');
        $this->assertSame([], $this->getJson('/api/v1/marketing/approvals/pending')->json('data')); // belum giliran admin

        $this->actAs('supervisor');
        $this->postJson($this->url($c->id, 'confirm-difference'))->assertOk();
        $this->approve($c->id)->assertOk();
        $this->approve($c->id)->assertOk();

        $this->assertSame([], $this->getJson('/api/v1/marketing/approvals/pending')->json('data')); // sekarang giliran admin
        $this->actAs('admin');
        $later = $this->getJson('/api/v1/marketing/approvals/pending')->assertOk();
        $this->assertSame(['PENGAJUAN'], array_column($later->json('data'), 'kind'));
        $this->assertSame('Manager Accounting', $later->json('data.0.awaiting_label'));
    }

    public function test_the_list_flags_the_claims_that_need_my_action(): void
    {
        $c = $this->submitted();

        $this->actAs('supervisor');
        $this->assertTrue($this->getJson('/api/v1/marketing/claims')->json('data.0.can_act'));

        $this->actAs('admin');
        $this->assertFalse($this->getJson('/api/v1/marketing/claims')->json('data.0.can_act'));
        $this->assertSame('SUBMITTED', $this->getJson('/api/v1/marketing/claims?status=SUBMITTED')->json('data.0.status'));
        $this->assertSame($c->id, $this->getJson('/api/v1/marketing/claims?status=SUBMITTED')->json('data.0.id'));
    }

    public function test_the_approvers_come_from_the_config(): void
    {
        config(['marketing.approval.claim_submission.1.roles' => ['admin']]);
        $c = $this->submitted();

        $this->actAs('supervisor');
        $this->postJson($this->url($c->id, 'confirm-difference'))->assertStatus(403);
        $this->actAs('admin');
        $this->postJson($this->url($c->id, 'confirm-difference'))->assertOk();
        $this->approve($c->id)->assertOk();
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        $c = $this->submitted();
        $this->toStage4($c);
        $this->actAs('admin');
        $this->approve($c->id, ['adjusted_amount' => 8000, 'adjust_reason' => 'Retur'])->assertOk();
        $this->actAs('supervisor');
        $this->postJson($this->url($c->id, 'approved-amount'), ['amount' => 8000])->assertOk();

        foreach (['confirm_difference', 'approve', 'final_amount'] as $step) {
            $this->assertTrue(AuditLog::where('action', "marketing_claim.{$step}")->where('entity_id', $c->id)->exists(), $step);
        }
        $this->assertSame(4, AuditLog::where('action', 'marketing_claim.approve')->where('entity_id', $c->id)->count());
    }

    public function test_sales_and_other_roles_cannot_use_the_approval_endpoints(): void
    {
        $c = $this->submitted();

        foreach (['sales', 'finance', 'warehouse'] as $role) {
            $this->actAs($role);
            $this->postJson($this->url($c->id, 'confirm-difference'))->assertStatus(403);
            $this->approve($c->id)->assertStatus(403);
            $this->reject($c->id)->assertStatus(403);
            $this->postJson($this->url($c->id, 'approved-amount'), ['amount' => 10000])->assertStatus(403);
        }

        $this->assertSame('SUBMITTED', MarketingClaim::find($c->id)->status);
    }

    public function test_login_is_required_and_unknown_claims_return_404(): void
    {
        $this->postJson('/api/v1/marketing/claims/1/confirm-difference')->assertStatus(401);
        $this->postJson('/api/v1/marketing/claims/1/approve', ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(401);
        $this->postJson('/api/v1/marketing/claims/1/reject', ['reason_code' => 'DOKUMEN_KURANG'])->assertStatus(401);
        $this->postJson('/api/v1/marketing/claims/1/approved-amount', ['amount' => 1])->assertStatus(401);

        $this->actAs('admin');

        $this->postJson('/api/v1/marketing/claims/999/confirm-difference')->assertStatus(404);
        $this->postJson('/api/v1/marketing/claims/999/approve', ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(404);
        $this->postJson('/api/v1/marketing/claims/999/reject', ['reason_code' => 'DOKUMEN_KURANG'])->assertStatus(404);
        $this->postJson('/api/v1/marketing/claims/999/approved-amount', ['amount' => 1])->assertStatus(404);
    }
}