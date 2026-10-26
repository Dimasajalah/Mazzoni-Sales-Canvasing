<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\MarketingBudget;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.1 / MKT01: Budget Marketing Entry (Campaign berisi budget per tahun). */
class MarketingBudgetTest extends TestCase
{
    use RefreshDatabase;

    private function as(string $role): User
    {
        $u = User::factory()->create(['role' => $role, 'active' => true]);
        Sanctum::actingAs($u);

        return $u;
    }

    private function payload(array $over = []): array
    {
        return array_merge(['name' => 'Campaign Ramadan', 'fiscal_year' => 2026, 'total_budget' => 1500000], $over);
    }

    public function test_a_manager_creates_a_budget_with_an_automatic_code_and_nothing_allocated(): void
    {
        $this->as('supervisor');

        $r = $this->postJson('/api/v1/marketing/budgets', $this->payload())->assertStatus(201);

        $this->assertMatchesRegularExpression('/^BDG-2026-001$/', $r->json('data.campaign_code'));
        $this->assertSame(1500000.0, (float) $r->json('data.remaining_budget'));
        $this->assertSame('ACTIVE', $r->json('data.status'));
    }

    public function test_codes_increase_per_year(): void
    {
        $this->as('admin');
        $this->postJson('/api/v1/marketing/budgets', $this->payload())->assertStatus(201);
        $second = $this->postJson('/api/v1/marketing/budgets', $this->payload())->assertStatus(201);
        $other = $this->postJson('/api/v1/marketing/budgets', $this->payload(['fiscal_year' => 2027]))->assertStatus(201);

        $this->assertSame('BDG-2026-002', $second->json('data.campaign_code'));
        $this->assertSame('BDG-2027-001', $other->json('data.campaign_code'));
    }

    public function test_a_custom_campaign_code_is_accepted_but_must_be_unique(): void
    {
        $this->as('admin');
        $this->postJson('/api/v1/marketing/budgets', $this->payload(['campaign_code' => 'CMP-RMDN']))->assertStatus(201);

        $this->postJson('/api/v1/marketing/budgets', $this->payload(['campaign_code' => 'CMP-RMDN']))->assertStatus(422);
    }

    public function test_the_total_must_be_positive_and_the_name_is_required(): void
    {
        $this->as('admin');

        $this->postJson('/api/v1/marketing/budgets', $this->payload(['total_budget' => 0]))->assertStatus(422);
        $this->postJson('/api/v1/marketing/budgets', $this->payload(['name' => '']))->assertStatus(422);
    }

    public function test_sales_cannot_see_or_create_budgets(): void
    {
        $this->as('sales');

        $this->getJson('/api/v1/marketing/budgets')->assertStatus(403);
        $this->postJson('/api/v1/marketing/budgets', $this->payload())->assertStatus(403);
        $this->assertSame(0, MarketingBudget::count());
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/marketing/budgets')->assertStatus(401);
    }

    public function test_the_list_can_be_filtered_by_year(): void
    {
        $this->as('admin');
        $this->postJson('/api/v1/marketing/budgets', $this->payload(['fiscal_year' => 2025]));
        $this->postJson('/api/v1/marketing/budgets', $this->payload(['fiscal_year' => 2026]));

        $r = $this->getJson('/api/v1/marketing/budgets?fiscal_year=2026')->assertOk();

        $this->assertCount(1, $r->json('data'));
        $this->assertSame(2026, $r->json('data.0.fiscal_year'));
    }

    public function test_the_total_cannot_drop_below_what_is_already_allocated(): void
    {
        $this->as('admin');
        $id = $this->postJson('/api/v1/marketing/budgets', $this->payload())->json('data.id');
        MarketingBudget::whereKey($id)->update(['allocated_amount' => 600000]);

        $this->patchJson("/api/v1/marketing/budgets/{$id}", ['total_budget' => 500000])->assertStatus(422);
        $ok = $this->patchJson("/api/v1/marketing/budgets/{$id}", ['total_budget' => 700000])->assertOk();

        $this->assertSame(100000.0, (float) $ok->json('data.remaining_budget'));
    }

    public function test_the_code_and_year_cannot_be_changed_but_the_budget_can_be_closed(): void
    {
        $this->as('admin');
        $created = $this->postJson('/api/v1/marketing/budgets', $this->payload())->json('data');

        $r = $this->patchJson("/api/v1/marketing/budgets/{$created['id']}", [
            'campaign_code' => 'HACK', 'fiscal_year' => 2030, 'status' => 'CLOSED',
        ])->assertOk();

        $this->assertSame($created['campaign_code'], $r->json('data.campaign_code'));
        $this->assertSame(2026, $r->json('data.fiscal_year'));
        $this->assertSame('CLOSED', $r->json('data.status'));
    }

    public function test_create_and_update_are_written_to_the_audit_log(): void
    {
        $this->as('admin');
        $id = $this->postJson('/api/v1/marketing/budgets', $this->payload())->json('data.id');
        $this->patchJson("/api/v1/marketing/budgets/{$id}", ['name' => 'Campaign Lebaran']);

        $this->assertTrue(AuditLog::where('action', 'marketing_budget.create')->where('entity_id', $id)->exists());
        $this->assertTrue(AuditLog::where('action', 'marketing_budget.update')->where('entity_id', $id)->exists());
    }

    public function test_an_unknown_budget_returns_404(): void
    {
        $this->as('admin');

        $this->getJson('/api/v1/marketing/budgets/999')->assertStatus(404);
    }
}