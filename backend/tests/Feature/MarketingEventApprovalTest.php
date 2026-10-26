<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingEvent;
use App\Models\MarketingEventApproval;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.6 / MKT06: Approval Event (6 tahap, tahap 6 bila RAB di atas 30 juta, ditolak = direvisi lalu diajukan ulang). */
class MarketingEventApprovalTest extends TestCase
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

    private function budget(): MarketingBudget
    {
        return MarketingBudget::first() ?? MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 100000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
    }

    private function eventPayload(array $over = []): array
    {
        return $over + [
            'marketing_budget_id' => $this->budget()->id, 'description' => 'Bazaar Ramadan', 'reference_letter_no' => 'SK/001/2026',
            'activity_type' => 'EVENT', 'start_date' => '2026-11-01', 'end_date' => '2026-11-30',
            'target_type' => 'NATIONAL', 'budget_amount' => 1000000,
        ];
    }

    /** Event baru (Menunggu Persetujuan, Tahap 1). Dibuat oleh admin. */
    private function event(array $over = []): int
    {
        $this->actAs($this->user('admin'));
        if (! Customer::count()) {
            Customer::create(['customer_code' => 'C1', 'name' => 'Toko C1', 'active' => true]);
        }

        return $this->postJson('/api/v1/marketing/events', $this->eventPayload($over))->assertStatus(201)->json('data.id');
    }

    private function approve(int $id, array $over = [])
    {
        return $this->postJson("/api/v1/marketing/events/{$id}/approve", $over + ['reason_code' => 'SESUAI_ANGGARAN']);
    }

    private function reject(int $id, array $over = [])
    {
        return $this->postJson("/api/v1/marketing/events/{$id}/reject", $over + ['reason_code' => 'DOKUMEN_KURANG']);
    }

    private function revisePayload(array $over = []): array
    {
        return $over + [
            'description' => 'Bazaar Ramadan (revisi)', 'reference_letter_no' => 'SK/001/2026', 'activity_type' => 'EVENT',
            'start_date' => '2026-11-05', 'end_date' => '2026-12-05', 'target_type' => 'NATIONAL', 'budget_amount' => 2000000,
        ];
    }

    /** Bawaan: tahap 1-3 supervisor, tahap 4-5 (dan 6) admin. */
    private function approveStages(int $id, array $stages): void
    {
        foreach ($stages as $stage) {
            $this->actAs($this->user($stage <= 3 ? 'supervisor' : 'admin'));
            $this->approve($id)->assertOk();
        }
    }

    public function test_a_new_event_waits_for_stage_1_with_five_stages_when_the_budget_is_30_million_or_less(): void
    {
        $id = $this->event(['budget_amount' => 30000000]);
        $this->actAs($this->user('supervisor'));

        $r = $this->getJson("/api/v1/marketing/events/{$id}")->assertOk();

        $this->assertSame('PENDING_APPROVAL', $r->json('data.status'));
        $this->assertSame(1, $r->json('data.approval.stage'));
        $this->assertSame(1, $r->json('data.approval.round'));
        $this->assertSame('Koordinator Marketing', $r->json('data.approval.awaiting_label'));
        $this->assertTrue($r->json('data.approval.can_act'));
        $this->assertSame(
            ['Koordinator Marketing', 'SPV Per Region', 'Manager Marketing', 'Manager Accounting', 'Direktur Sales'],
            array_column($r->json('data.approval.levels'), 'label')
        );
    }

    public function test_above_30_million_a_sixth_stage_with_direktur_utama_applies(): void
    {
        $id = $this->event(['budget_amount' => 30000001]);
        $this->actAs($this->user('supervisor'));

        $r = $this->getJson("/api/v1/marketing/events/{$id}")->assertOk();

        $this->assertSame(6, count($r->json('data.approval.levels')));
        $this->assertSame('Direktur Utama', $r->json('data.approval.levels.5.label'));
    }

    public function test_five_approvals_in_order_activate_an_event_of_30_million_or_less(): void
    {
        $id = $this->event(['budget_amount' => 30000000]);

        $this->approveStages($id, [1, 2, 3, 4]);
        $this->assertSame('PENDING_APPROVAL', MarketingEvent::find($id)->status);
        $this->assertSame(5, MarketingEvent::find($id)->approval_stage);

        $this->actAs($this->user('admin'));
        $last = $this->approve($id)->assertOk();

        $this->assertSame('APPROVED', $last->json('data.status'));
        $this->assertNull($last->json('data.approval.awaiting_label'));
        $this->assertSame([1, 2, 3, 4, 5], array_column($last->json('data.approvals'), 'stage'));
        $this->assertSame(
            ['Koordinator Marketing', 'SPV Per Region', 'Manager Marketing', 'Manager Accounting', 'Direktur Sales'],
            array_column($last->json('data.approvals'), 'stage_label')
        );
        $this->assertSame(30000000.0, (float) MarketingBudget::first()->allocated_amount);
    }

    public function test_above_30_million_stage_6_is_needed_before_the_event_is_approved(): void
    {
        $id = $this->event(['budget_amount' => 40000000]);

        $this->approveStages($id, [1, 2, 3, 4, 5]);
        $this->assertSame('PENDING_APPROVAL', MarketingEvent::find($id)->status);
        $this->assertSame(6, MarketingEvent::find($id)->approval_stage);

        $this->actAs($this->user('admin'));
        $last = $this->approve($id)->assertOk();

        $this->assertSame('APPROVED', $last->json('data.status'));
        $this->assertSame('Direktur Utama', $last->json('data.approvals.5.stage_label'));
    }

    public function test_the_30_million_threshold_comes_from_the_config(): void
    {
        config(['marketing.approval.event.6.when_amount_above' => 100000000]);
        $id = $this->event(['budget_amount' => 40000000]);
        $this->actAs($this->user('supervisor'));

        $r = $this->getJson("/api/v1/marketing/events/{$id}")->assertOk();

        $this->assertSame(5, count($r->json('data.approval.levels')));
    }

    public function test_only_the_stage_approver_can_act_at_each_stage(): void
    {
        $id = $this->event();

        $this->actAs($this->user('admin')); // tahap 1 milik supervisor
        $this->approve($id)->assertStatus(403);
        $this->reject($id)->assertStatus(403);

        $this->actAs($this->user('supervisor'));
        $this->approve($id)->assertOk();
        $this->approve($id)->assertOk(); // tahap 2, supervisor juga (bawaan)
        $this->approve($id)->assertOk(); // tahap 3
        $this->approve($id)->assertStatus(403); // tahap 4 milik admin

        $this->assertSame(4, MarketingEvent::find($id)->approval_stage);
    }

    public function test_rejecting_at_any_stage_ends_the_round_and_returns_the_budget(): void
    {
        $id = $this->event(['budget_amount' => 5000000]);
        $this->approveStages($id, [1, 2, 3]);
        $this->assertSame(5000000.0, (float) MarketingBudget::first()->allocated_amount);
        $this->actAs($this->user('admin'));

        $r = $this->reject($id, ['reason_code' => 'ANGGARAN_TIDAK_SESUAI', 'notes' => 'Terlalu besar'])->assertOk();

        $this->assertSame('REJECTED', $r->json('data.status'));
        $this->assertSame('Manager Accounting', $r->json('data.approvals.3.stage_label'));
        $this->assertSame(0.0, (float) MarketingBudget::first()->allocated_amount);

        $this->approve($id)->assertStatus(422); // sudah diproses
    }

    public function test_a_reason_code_is_required_and_must_match_the_decision(): void
    {
        $id = $this->event();
        $this->actAs($this->user('supervisor'));

        $this->postJson("/api/v1/marketing/events/{$id}/approve", [])->assertStatus(422);
        $this->approve($id, ['reason_code' => 'DOKUMEN_KURANG'])->assertStatus(422);
        $this->reject($id, ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(422);

        $this->assertSame(0, MarketingEventApproval::count());
        $this->assertSame(1, MarketingEvent::find($id)->approval_stage);
    }

    public function test_a_rejected_event_can_be_revised_and_resubmitted_from_stage_1(): void
    {
        $id = $this->event(['budget_amount' => 1000000]);
        $this->actAs($this->user('supervisor'));
        $this->reject($id)->assertOk();
        $this->assertSame(0.0, (float) MarketingBudget::first()->allocated_amount);

        $r = $this->postJson("/api/v1/marketing/events/{$id}/revise", $this->revisePayload())->assertOk();

        $this->assertSame('PENDING_APPROVAL', $r->json('data.status'));
        $this->assertSame(1, $r->json('data.approval.stage'));
        $this->assertSame(2, $r->json('data.approval.round'));
        $this->assertSame('Bazaar Ramadan (revisi)', $r->json('data.description'));
        $this->assertSame('2026-12-05', $r->json('data.end_date'));
        $this->assertSame(2000000.0, (float) $r->json('data.budget_amount'));
        $this->assertSame(2000000.0, (float) MarketingBudget::first()->allocated_amount);
        $this->assertSame('BDG-2026-001-E01', $r->json('data.event_code')); // nomor event tidak berubah
        $this->assertCount(1, $r->json('data.approvals')); // keputusan putaran 1 tetap tercatat
        $this->assertSame(1, $r->json('data.approvals.0.round'));
    }

    public function test_decisions_after_a_revision_are_recorded_in_the_new_round(): void
    {
        $id = $this->event();
        $this->actAs($this->user('supervisor'));
        $this->reject($id)->assertOk();
        $this->postJson("/api/v1/marketing/events/{$id}/revise", $this->revisePayload())->assertOk();

        $this->approve($id)->assertOk();

        $this->assertSame([1, 2], MarketingEventApproval::orderBy('id')->pluck('round')->all());
        $this->assertSame(['REJECTED', 'APPROVED'], MarketingEventApproval::orderBy('id')->pluck('action')->all());
        $this->assertSame(2, MarketingEvent::find($id)->approval_stage);
    }

    public function test_a_revision_rebuilds_the_participants_from_the_new_target(): void
    {
        $id = $this->event();
        $a = Customer::create(['customer_code' => 'A', 'name' => 'Toko A', 'active' => true]);
        $this->actAs($this->user('supervisor'));
        $this->reject($id)->assertOk();

        $r = $this->postJson("/api/v1/marketing/events/{$id}/revise", $this->revisePayload(['target_type' => 'CUSTOMER', 'customer_ids' => [$a->id]]))->assertOk();

        $this->assertSame(1, $r->json('data.participants_count'));
        $this->assertSame('A', $r->json('data.participants.0.customer_code'));
        $this->assertSame('A', $r->json('data.target_customers.0.customer_code'));
    }

    public function test_only_a_rejected_event_can_be_revised(): void
    {
        $id = $this->event();
        $this->actAs($this->user('supervisor'));

        $this->postJson("/api/v1/marketing/events/{$id}/revise", $this->revisePayload())->assertStatus(422);
        $this->assertSame(1, MarketingEvent::find($id)->approval_round);
    }

    public function test_a_revision_above_the_remaining_budget_is_rejected_and_the_event_stays_rejected(): void
    {
        $this->actAs($this->user('admin'));
        $budget = MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'C', 'fiscal_year' => 2026, 'total_budget' => 1000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        Customer::create(['customer_code' => 'C1', 'name' => 'Toko C1', 'active' => true]);
        $a = $this->postJson('/api/v1/marketing/events', $this->eventPayload(['budget_amount' => 300000]))->json('data.id');
        $this->postJson('/api/v1/marketing/events', $this->eventPayload(['reference_letter_no' => 'SK/002', 'budget_amount' => 700000]))->assertStatus(201);
        $this->actAs($this->user('supervisor'));
        $this->reject($a)->assertOk();
        $this->assertSame(700000.0, (float) $budget->fresh()->allocated_amount); // sisa 300.000 setelah event A ditolak

        $this->postJson("/api/v1/marketing/events/{$a}/revise", $this->revisePayload(['budget_amount' => 400000]))->assertStatus(422);

        $this->assertSame('REJECTED', MarketingEvent::find($a)->status);
        $this->assertSame(700000.0, (float) $budget->fresh()->allocated_amount);

        $this->postJson("/api/v1/marketing/events/{$a}/revise", $this->revisePayload(['budget_amount' => 300000]))->assertOk(); // pas sebesar sisa
    }

    public function test_a_revision_may_keep_its_letter_number_but_not_take_another_events(): void
    {
        $a = $this->event();
        $this->postJson('/api/v1/marketing/events', $this->eventPayload(['reference_letter_no' => 'SK/002']))->assertStatus(201);
        $this->actAs($this->user('supervisor'));
        $this->reject($a)->assertOk();

        $this->postJson("/api/v1/marketing/events/{$a}/revise", $this->revisePayload(['reference_letter_no' => 'SK/002']))->assertStatus(422);
        $this->postJson("/api/v1/marketing/events/{$a}/revise", $this->revisePayload(['reference_letter_no' => 'SK/001/2026']))->assertOk();
    }

    public function test_the_pending_dashboard_only_lists_programs_waiting_for_me(): void
    {
        $eventId = $this->event();
        $this->postJson('/api/v1/marketing/claim-programs', [
            'marketing_budget_id' => $this->budget()->id, 'description' => 'Diskon Saus', 'reference_letter_no' => 'SKP/001',
            'claim_type' => 'DISKON_PRODUK', 'claim_source' => 'SELL_OUT', 'claim_basis' => 'SALES_VALUE', 'claim_rate_type' => 'PERCENT',
            'claim_rate' => 2.5, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'claim_deadline' => '2026-12-15',
            'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201);

        $this->actAs($this->user('supervisor')); // tahap 1 event dan tahap 1 klaim sama-sama supervisor
        $mine = $this->getJson('/api/v1/marketing/approvals/pending')->assertOk();
        $this->assertEqualsCanonicalizing(['EVENT', 'KLAIM'], array_column($mine->json('data'), 'kind'));
        $this->assertSame([true], array_values(array_unique(array_column($mine->json('data'), 'can_act'))));

        $this->actAs($this->user('admin')); // belum giliran admin
        $this->assertSame([], $this->getJson('/api/v1/marketing/approvals/pending')->assertOk()->json('data'));

        $this->approveStages($eventId, [1, 2, 3]); // event naik ke tahap 4 (admin)
        $this->actAs($this->user('admin'));
        $later = $this->getJson('/api/v1/marketing/approvals/pending')->assertOk();
        $this->assertSame(['EVENT'], array_column($later->json('data'), 'kind'));
        $this->assertSame('Manager Accounting', $later->json('data.0.awaiting_label'));
    }

    public function test_the_event_list_flags_which_events_need_my_decision(): void
    {
        $this->event();

        $this->actAs($this->user('supervisor'));
        $mine = $this->getJson('/api/v1/marketing/events?kind=EVENT')->assertOk();
        $this->assertTrue($mine->json('data.0.can_act'));
        $this->assertSame('Koordinator Marketing', $mine->json('data.0.awaiting_label'));

        $this->actAs($this->user('admin'));
        $this->assertFalse($this->getJson('/api/v1/marketing/events?kind=EVENT')->json('data.0.can_act'));
    }

    public function test_decisions_and_revisions_are_written_to_the_audit_log(): void
    {
        $id = $this->event();
        $this->actAs($this->user('supervisor'));
        $this->reject($id)->assertOk();
        $this->postJson("/api/v1/marketing/events/{$id}/revise", $this->revisePayload())->assertOk();
        $this->approve($id)->assertOk();

        foreach (['marketing_event.reject', 'marketing_event.revise', 'marketing_event.approve'] as $action) {
            $this->assertTrue(AuditLog::where('action', $action)->where('entity_id', $id)->exists(), $action);
        }
    }

    public function test_a_claim_program_cannot_go_through_the_event_approval_or_revision(): void
    {
        $this->actAs($this->user('admin'));
        $budget = $this->budget();
        Customer::create(['customer_code' => 'C1', 'name' => 'Toko C1', 'active' => true]);
        $claimId = $this->postJson('/api/v1/marketing/claim-programs', [
            'marketing_budget_id' => $budget->id, 'description' => 'Diskon', 'reference_letter_no' => 'SKP/9',
            'claim_type' => 'DISKON_PRODUK', 'claim_source' => 'SELL_IN', 'claim_basis' => 'SALES_VALUE', 'claim_rate_type' => 'PERCENT',
            'claim_rate' => 1, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'claim_deadline' => '2026-12-15',
            'target_type' => 'NATIONAL', 'budget_amount' => 1000,
        ])->json('data.id');

        $this->actAs($this->user('supervisor'));
        $this->approve($claimId)->assertStatus(404);
        $this->postJson("/api/v1/marketing/events/{$claimId}/revise", $this->revisePayload())->assertStatus(404);
        $this->approve(999)->assertStatus(404);
    }

    public function test_sales_and_other_roles_cannot_decide_revise_or_open_the_dashboard(): void
    {
        $id = $this->event();

        foreach (['sales', 'finance', 'warehouse'] as $role) {
            $this->actAs($this->user($role));
            $this->approve($id)->assertStatus(403);
            $this->reject($id)->assertStatus(403);
            $this->postJson("/api/v1/marketing/events/{$id}/revise", $this->revisePayload())->assertStatus(403);
            $this->getJson('/api/v1/marketing/approvals/pending')->assertStatus(403);
        }
        $this->assertSame(0, MarketingEventApproval::count());
    }

    public function test_the_new_endpoints_require_login(): void
    {
        $this->postJson('/api/v1/marketing/events/1/approve', ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(401);
        $this->postJson('/api/v1/marketing/events/1/revise', [])->assertStatus(401);
        $this->getJson('/api/v1/marketing/approvals/pending')->assertStatus(401);
    }
}