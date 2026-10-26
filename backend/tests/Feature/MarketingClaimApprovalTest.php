<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.5 / MKT05: Approval Pembuatan Program Klaim (Manager Marketing, lalu Direktur Sales). */
class MarketingClaimApprovalTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(User $u): void
    {
        Sanctum::actingAs($u);
    }

    /** Program klaim baru (Menunggu Persetujuan, Tahap 1). Dibuat oleh admin. */
    private function program(): int
    {
        $this->actAs($this->user('admin'));
        $b = MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 1000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        Customer::create(['customer_code' => 'C1', 'name' => 'Toko C1', 'active' => true]);

        return $this->postJson('/api/v1/marketing/claim-programs', [
            'marketing_budget_id' => $b->id, 'description' => 'Diskon Saus Q4', 'reference_letter_no' => 'SKP/001/2026',
            'claim_type' => 'DISKON_PRODUK', 'claim_source' => 'SELL_OUT', 'claim_basis' => 'SALES_VALUE',
            'claim_rate_type' => 'PERCENT', 'claim_rate' => 2.5, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30',
            'claim_deadline' => '2026-12-15', 'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201)->json('data.id');
    }

    private function approve(int $id, array $over = [])
    {
        return $this->postJson("/api/v1/marketing/claim-programs/{$id}/approve", $over + ['reason_code' => 'SESUAI_ANGGARAN']);
    }

    private function reject(int $id, array $over = [])
    {
        return $this->postJson("/api/v1/marketing/claim-programs/{$id}/reject", $over + ['reason_code' => 'DOKUMEN_KURANG']);
    }

    public function test_a_new_claim_program_waits_for_stage_1_manager_marketing(): void
    {
        $id = $this->program();
        $this->actAs($this->user('supervisor'));

        $r = $this->getJson("/api/v1/marketing/claim-programs/{$id}")->assertOk();

        $this->assertSame('PENDING_APPROVAL', $r->json('data.status'));
        $this->assertSame(1, $r->json('data.approval.stage'));
        $this->assertSame('Manager Marketing', $r->json('data.approval.awaiting_label'));
        $this->assertTrue($r->json('data.approval.can_act'));
        $this->assertSame(['Manager Marketing', 'Direktur Sales'], array_column($r->json('data.approval.levels'), 'label'));
        $this->assertSame([], $r->json('data.approvals'));
    }

    public function test_two_approvals_in_order_make_the_program_approved(): void
    {
        $id = $this->program();
        $manager = $this->user('supervisor', ['name' => 'Bu Manager']);
        $director = $this->user('admin', ['name' => 'Pak Direktur']);

        $this->actAs($manager);
        $one = $this->approve($id, ['notes' => 'Anggaran aman'])->assertOk();
        $this->assertSame('PENDING_APPROVAL', $one->json('data.status'));
        $this->assertSame(2, $one->json('data.approval.stage'));
        $this->assertSame('Direktur Sales', $one->json('data.approval.awaiting_label'));
        $this->assertFalse($one->json('data.approval.can_act')); // manager tidak boleh bertindak di tahap 2

        $this->actAs($director);
        $two = $this->approve($id, ['reason_code' => 'SESUAI_STRATEGI'])->assertOk();
        $this->assertSame('APPROVED', $two->json('data.status'));
        $this->assertNull($two->json('data.approval.awaiting_label'));

        $history = $two->json('data.approvals');
        $this->assertCount(2, $history);
        $this->assertSame([1, 2], array_column($history, 'stage'));
        $this->assertSame(['APPROVED', 'APPROVED'], array_column($history, 'action'));
        $this->assertSame(['Bu Manager', 'Pak Direktur'], array_column(array_column($history, 'actor'), 'name'));
        $this->assertSame('Sesuai anggaran', $history[0]['reason_label']);
        $this->assertSame('Anggaran aman', $history[0]['notes']);
        $this->assertSame('Manager Marketing', $history[0]['stage_label']);
        $this->assertSame(400000.0, (float) MarketingBudget::first()->allocated_amount);
    }

    public function test_only_the_stage_approver_can_act_at_each_stage(): void
    {
        $id = $this->program();

        $this->actAs($this->user('admin')); // Direktur Sales belum giliran
        $this->approve($id)->assertStatus(403);
        $this->reject($id)->assertStatus(403);

        $this->actAs($this->user('supervisor'));
        $this->approve($id)->assertOk();
        $this->approve($id)->assertStatus(403); // tahap 2 bukan untuk supervisor

        $this->assertSame(2, MarketingEvent::first()->approval_stage);
    }

    public function test_rejecting_at_stage_1_ends_the_flow_and_returns_the_budget(): void
    {
        $id = $this->program();
        $this->assertSame(400000.0, (float) MarketingBudget::first()->allocated_amount);
        $this->actAs($this->user('supervisor'));

        $r = $this->reject($id, ['reason_code' => 'ANGGARAN_TIDAK_SESUAI', 'notes' => 'Terlalu besar'])->assertOk();

        $this->assertSame('REJECTED', $r->json('data.status'));
        $this->assertSame('Anggaran tidak sesuai', $r->json('data.approvals.0.reason_label'));
        $this->assertSame(0.0, (float) MarketingBudget::first()->allocated_amount);
        $this->assertSame(1000000.0, (float) MarketingBudget::first()->remaining_budget);

        $this->actAs($this->user('admin'));
        $this->approve($id)->assertStatus(422); // sudah diproses
    }

    public function test_rejecting_at_stage_2_also_returns_the_budget(): void
    {
        $id = $this->program();
        $this->actAs($this->user('supervisor'));
        $this->approve($id)->assertOk();
        $this->actAs($this->user('admin'));

        $r = $this->reject($id, ['reason_code' => 'TARGET_TIDAK_SESUAI'])->assertOk();

        $this->assertSame('REJECTED', $r->json('data.status'));
        $this->assertSame(2, $r->json('data.approvals.1.stage'));
        $this->assertSame(0.0, (float) MarketingBudget::first()->allocated_amount);
    }

    public function test_a_reason_code_is_required_and_must_match_the_decision(): void
    {
        $id = $this->program();
        $this->actAs($this->user('supervisor'));

        $this->postJson("/api/v1/marketing/claim-programs/{$id}/approve", [])->assertStatus(422);
        $this->approve($id, ['reason_code' => 'DOKUMEN_KURANG'])->assertStatus(422); // kode untuk reject
        $this->reject($id, ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(422); // kode untuk approve
        $this->approve($id, ['reason_code' => 'NGAWUR'])->assertStatus(422);

        $this->assertSame('PENDING_APPROVAL', MarketingEvent::first()->status);
        $this->assertSame(1, MarketingEvent::first()->approval_stage);
        $this->assertSame(0, \App\Models\MarketingEventApproval::count());
    }

    public function test_a_finished_program_cannot_be_decided_again(): void
    {
        $id = $this->program();
        $this->actAs($this->user('supervisor'));
        $this->approve($id)->assertOk();
        $this->actAs($this->user('admin'));
        $this->approve($id)->assertOk();

        $this->approve($id)->assertStatus(422);
        $this->reject($id)->assertStatus(422);
        $this->assertSame(2, \App\Models\MarketingEventApproval::count());
    }

    public function test_approvers_can_also_be_assigned_by_email(): void
    {
        config(['marketing.approval.claim.1.emails' => ['Boss@Example.Test']]);
        $id = $this->program();

        $this->actAs($this->user('admin', ['email' => 'boss@example.test'])); // admin biasanya hanya Tahap 2
        $this->approve($id)->assertOk();

        $this->assertSame(2, MarketingEvent::first()->approval_stage);
    }

    public function test_the_roles_for_each_stage_come_from_the_config(): void
    {
        config(['marketing.approval.claim.1.roles' => ['admin'], 'marketing.approval.claim.2.roles' => ['supervisor']]);
        $id = $this->program();

        $this->actAs($this->user('supervisor'));
        $this->approve($id)->assertStatus(403);

        $this->actAs($this->user('admin'));
        $this->approve($id)->assertOk();

        $this->actAs($this->user('supervisor'));
        $this->approve($id)->assertOk();
        $this->assertSame('APPROVED', MarketingEvent::first()->status);
    }

    public function test_the_list_flags_which_programs_need_my_decision(): void
    {
        $this->program();

        $this->actAs($this->user('supervisor'));
        $mine = $this->getJson('/api/v1/marketing/claim-programs')->assertOk();
        $this->assertTrue($mine->json('data.0.can_act'));
        $this->assertSame('Manager Marketing', $mine->json('data.0.awaiting_label'));

        $this->actAs($this->user('admin'));
        $notMine = $this->getJson('/api/v1/marketing/claim-programs')->assertOk();
        $this->assertFalse($notMine->json('data.0.can_act'));
        $this->assertSame('Manager Marketing', $notMine->json('data.0.awaiting_label'));
    }

    public function test_decisions_are_written_to_the_audit_log(): void
    {
        $id = $this->program();
        $this->actAs($this->user('supervisor'));
        $this->approve($id)->assertOk();
        $this->actAs($this->user('admin'));
        $this->reject($id)->assertOk();

        $this->assertTrue(AuditLog::where('action', 'marketing_claim_program.approve')->where('entity_id', $id)->exists());
        $this->assertTrue(AuditLog::where('action', 'marketing_claim_program.reject')->where('entity_id', $id)->exists());
    }

    public function test_an_ordinary_event_cannot_go_through_the_claim_approval(): void
    {
        $this->actAs($this->user('admin'));
        $b = MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'C', 'fiscal_year' => 2026, 'total_budget' => 1000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        Customer::create(['customer_code' => 'C1', 'name' => 'Toko C1', 'active' => true]);
        $eventId = $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => $b->id, 'description' => 'Bazaar', 'reference_letter_no' => 'SK/1', 'activity_type' => 'EVENT',
            'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 1000,
        ])->json('data.id');

        $this->actAs($this->user('supervisor'));
        $this->approve($eventId)->assertStatus(404);
        $this->approve(999)->assertStatus(404);
    }

    public function test_sales_and_other_roles_cannot_decide_and_login_is_required(): void
    {
        $id = $this->program();

        foreach (['sales', 'finance', 'warehouse'] as $role) {
            $this->actAs($this->user($role));
            $this->approve($id)->assertStatus(403);
            $this->reject($id)->assertStatus(403);
        }
        $this->assertSame(0, \App\Models\MarketingEventApproval::count());
    }

    public function test_the_approval_endpoints_require_login(): void
    {
        $this->postJson('/api/v1/marketing/claim-programs/1/approve', ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(401);
    }
}