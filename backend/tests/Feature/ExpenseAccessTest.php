<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Expense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pengerasan akses expense: status tidak bisa diisi saat membuat, peran penyetuju dan pembayar, urutan status,
 * kepemilikan data, dan penomoran. Siklus: Submitted -> Approved -> Paid (bisa Rejected).
 */
class ExpenseAccessTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(User $u): User
    {
        Sanctum::actingAs($u);

        return $u;
    }

    private function submitExpense(User $owner, array $over = []): int
    {
        $this->actAs($owner);

        return $this->postJson('/api/v1/expenses', $over + ['category' => 'Bensin', 'amount' => 50000, 'note' => 'Kunjungan'])
            ->assertStatus(201)->json('data.id');
    }

    private function setStatus(int $id, string $status, ?string $notes = null)
    {
        return $this->patchJson("/api/v1/expenses/{$id}/status", ['status' => $status] + ($notes ? ['notes' => $notes] : []));
    }

    private function idsOf($response): array
    {
        $d = $response->json('data');
        $rows = is_array($d) && array_key_exists('data', $d) ? $d['data'] : $d;

        return array_map('intval', array_column((array) $rows, 'id'));
    }

    /** Menyiapkan expense yang sudah disetujui supervisor. */
    private function approvedExpense(User $owner): int
    {
        $id = $this->submitExpense($owner);
        $this->actAs($this->makeUser('supervisor'));
        $this->setStatus($id, 'APPROVED')->assertOk();

        return $id;
    }

    // ---------------------------------------------------------------- membuat

    public function test_a_status_sent_when_creating_an_expense_is_ignored(): void
    {
        $this->actAs($this->makeUser('sales'));

        $r = $this->postJson('/api/v1/expenses', ['category' => 'Tol', 'amount' => 25000, 'status' => 'PAID'])->assertStatus(201);

        $this->assertSame('SUBMITTED', $r->json('data.status'));
        $this->assertSame('SUBMITTED', Expense::find($r->json('data.id'))->status);
    }

    public function test_expense_numbers_are_sequential_and_unique(): void
    {
        $sales = $this->makeUser('sales');
        $first = Expense::find($this->submitExpense($sales))->expense_number;
        $second = Expense::find($this->submitExpense($sales))->expense_number;

        $this->assertNotSame($first, $second);
        $this->assertSame((int) substr($first, -6) + 1, (int) substr($second, -6));
    }

    // ---------------------------------------------------------------- siapa boleh mengubah status

    public function test_sales_cannot_approve_reject_or_pay_even_their_own_expense(): void
    {
        $sales = $this->makeUser('sales');
        $id = $this->submitExpense($sales);

        foreach (['APPROVED', 'REJECTED', 'PAID'] as $to) {
            $this->setStatus($id, $to)->assertStatus(403);
        }
        $this->assertSame('SUBMITTED', Expense::find($id)->status);
    }

    public function test_warehouse_cannot_change_expense_status(): void
    {
        $id = $this->submitExpense($this->makeUser('sales'));
        $this->actAs($this->makeUser('warehouse'));

        $this->setStatus($id, 'APPROVED')->assertStatus(403);
        $this->setStatus($id, 'PAID')->assertStatus(403);
    }

    public function test_supervisor_approves_but_cannot_mark_paid_by_default(): void
    {
        $id = $this->approvedExpense($this->makeUser('sales'));
        $this->actAs($this->makeUser('supervisor'));

        $this->setStatus($id, 'PAID')->assertStatus(403);
        $this->assertSame('APPROVED', Expense::find($id)->status);
    }

    public function test_finance_pays_an_approved_expense_but_cannot_approve(): void
    {
        $id = $this->submitExpense($this->makeUser('sales'));
        $this->actAs($this->makeUser('finance'));
        $this->setStatus($id, 'APPROVED')->assertStatus(403);
        $this->setStatus($id, 'REJECTED')->assertStatus(403);

        $this->actAs($this->makeUser('supervisor'));
        $this->setStatus($id, 'APPROVED')->assertOk();

        $this->actAs($this->makeUser('finance'));
        $this->assertSame('PAID', $this->setStatus($id, 'PAID', 'Transfer 22 Okt')->assertOk()->json('data.status'));
    }

    public function test_admin_can_approve_and_pay(): void
    {
        $id = $this->submitExpense($this->makeUser('sales'));
        $this->actAs($this->makeUser('admin'));

        $this->setStatus($id, 'APPROVED')->assertOk();
        $this->assertSame('PAID', $this->setStatus($id, 'PAID')->assertOk()->json('data.status'));
    }

    public function test_the_pay_roles_can_be_changed_by_config(): void
    {
        $id = $this->approvedExpense($this->makeUser('sales'));

        config(['access.expense_pay_roles' => ['finance', 'supervisor']]);
        $this->actAs($this->makeUser('supervisor'));
        $this->assertSame('PAID', $this->setStatus($id, 'PAID')->assertOk()->json('data.status'));
    }

    // ---------------------------------------------------------------- urutan status

    public function test_payment_cannot_skip_approval(): void
    {
        $id = $this->submitExpense($this->makeUser('sales'));

        foreach (['finance', 'admin'] as $role) {
            $this->actAs($this->makeUser($role));
            $this->setStatus($id, 'PAID')->assertStatus(422);
        }
        $this->assertSame('SUBMITTED', Expense::find($id)->status);
    }

    public function test_an_expense_can_be_rejected_from_submitted_and_from_approved(): void
    {
        $sales = $this->makeUser('sales');
        $fromSubmitted = $this->submitExpense($sales);
        $fromApproved = $this->approvedExpense($sales);

        $this->actAs($this->makeUser('supervisor'));
        $this->assertSame('REJECTED', $this->setStatus($fromSubmitted, 'REJECTED', 'Nota tidak jelas')->assertOk()->json('data.status'));
        $this->assertSame('REJECTED', $this->setStatus($fromApproved, 'REJECTED')->assertOk()->json('data.status'));
    }

    public function test_closed_expenses_cannot_change_again(): void
    {
        $sales = $this->makeUser('sales');
        $rejected = $this->submitExpense($sales);
        $this->actAs($this->makeUser('supervisor'));
        $this->setStatus($rejected, 'REJECTED')->assertOk();
        $this->setStatus($rejected, 'APPROVED')->assertStatus(422);

        $paid = $this->approvedExpense($sales);
        $this->actAs($this->makeUser('finance'));
        $this->setStatus($paid, 'PAID')->assertOk();
        $this->actAs($this->makeUser('supervisor'));
        $this->setStatus($paid, 'REJECTED')->assertStatus(422);
        $this->assertSame('PAID', Expense::find($paid)->status);
    }

    public function test_unknown_and_repeated_statuses_are_rejected(): void
    {
        $id = $this->submitExpense($this->makeUser('sales'));
        $this->actAs($this->makeUser('supervisor'));

        $this->setStatus($id, 'NGAWUR')->assertStatus(422);
        $this->setStatus($id, 'SUBMITTED')->assertStatus(422);
        $this->assertSame('SUBMITTED', Expense::find($id)->status);
    }

    public function test_status_changes_are_written_to_history_and_audit_log(): void
    {
        $id = $this->approvedExpense($this->makeUser('sales'));

        $this->assertSame(2, Expense::find($id)->statusHistories()->count()); // dibuat + disetujui
        $this->assertTrue(AuditLog::where('action', 'expense.status')->where('entity_id', $id)->exists());
    }

    public function test_status_change_checks_the_role_before_looking_for_the_expense(): void
    {
        $this->actAs($this->makeUser('sales'));
        $this->setStatus(999, 'APPROVED')->assertStatus(403);

        $this->actAs($this->makeUser('supervisor'));
        $this->setStatus(999, 'APPROVED')->assertStatus(404);
    }

    // ---------------------------------------------------------------- kepemilikan dan tombol layar

    public function test_a_sales_cannot_read_someone_elses_expense_but_approvers_and_payers_can(): void
    {
        $a = $this->makeUser('sales');
        $b = $this->makeUser('sales');
        $id = $this->submitExpense($a);

        $this->actAs($b);
        $this->getJson("/api/v1/expenses/{$id}")->assertStatus(404);

        foreach ([$a, $this->makeUser('supervisor'), $this->makeUser('admin'), $this->makeUser('finance')] as $who) {
            $this->actAs($who);
            $this->getJson("/api/v1/expenses/{$id}")->assertOk();
        }
        $this->actAs($this->makeUser('warehouse'));
        $this->getJson("/api/v1/expenses/{$id}")->assertStatus(404);
    }

    public function test_the_expense_list_is_forced_to_own_data_for_sales_and_the_client_filter_is_ignored(): void
    {
        $a = $this->makeUser('sales');
        $b = $this->makeUser('sales');
        $idA = $this->submitExpense($a);
        $idB = $this->submitExpense($b);

        $this->actAs($b);
        $this->assertSame([$idB], $this->idsOf($this->getJson('/api/v1/expenses')->assertOk()));
        $this->assertSame([$idB], $this->idsOf($this->getJson("/api/v1/expenses?salesperson_id={$a->id}")->assertOk()));

        foreach (['supervisor', 'finance'] as $role) {
            $this->actAs($this->makeUser($role));
            $this->assertEqualsCanonicalizing([$idA, $idB], $this->idsOf($this->getJson('/api/v1/expenses')->assertOk()));
            $this->assertSame([$idA], $this->idsOf($this->getJson("/api/v1/expenses?salesperson_id={$a->id}")->assertOk()));
        }

        $this->actAs($this->makeUser('warehouse'));
        $this->assertSame([], $this->idsOf($this->getJson('/api/v1/expenses')->assertOk()));
    }

    public function test_the_detail_tells_the_screen_which_buttons_to_show(): void
    {
        $sales = $this->makeUser('sales');
        $submitted = $this->submitExpense($sales);
        $approved = $this->approvedExpense($sales);
        $actions = fn (int $id) => $this->getJson("/api/v1/expenses/{$id}")->assertOk()->json('data.actions');

        $this->actAs($sales);
        $this->assertSame([], $actions($submitted));
        $this->actAs($this->makeUser('supervisor'));
        $this->assertSame(['APPROVED', 'REJECTED'], $actions($submitted));
        $this->assertSame(['REJECTED'], $actions($approved)); // boleh menolak, tidak boleh membayar
        $this->actAs($this->makeUser('finance'));
        $this->assertSame([], $actions($submitted));
        $this->assertSame(['PAID'], $actions($approved));

        $paid = $this->setStatus($approved, 'PAID')->assertOk();
        $this->assertSame([], $paid->json('data.actions')); // selesai: tidak ada tombol lagi
    }

    // ---------------------------------------------------------------- saklar darurat dan login

    public function test_the_emergency_switch_restores_the_old_behaviour(): void
    {
        $a = $this->makeUser('sales');
        $b = $this->makeUser('sales');
        $id = $this->submitExpense($a);

        config(['access.enforce' => false]);
        $this->actAs($b);
        $this->getJson("/api/v1/expenses/{$id}")->assertOk();
        $this->setStatus($id, 'APPROVED')->assertOk();
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/expenses')->assertStatus(401);
        $this->getJson('/api/v1/expenses/1')->assertStatus(401);
        $this->postJson('/api/v1/expenses', ['category' => 'X', 'amount' => 1])->assertStatus(401);
        $this->patchJson('/api/v1/expenses/1/status', ['status' => 'APPROVED'])->assertStatus(401);
    }
}