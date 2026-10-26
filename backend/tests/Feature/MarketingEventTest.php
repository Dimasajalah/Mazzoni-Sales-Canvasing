<?php
namespace Tests\Feature;

use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.2 / MKT02: Pure Event Entry. */
class MarketingEventTest extends TestCase
{
    use RefreshDatabase;

    private function as(string $role): User
    {
        $u = User::factory()->create(['role' => $role, 'active' => true]);
        Sanctum::actingAs($u);

        return $u;
    }

    private function budget(array $over = []): MarketingBudget
    {
        return MarketingBudget::create(array_merge([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 1000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ], $over));
    }

    private function customer(string $code, ?int $salesId = null, bool $active = true): Customer
    {
        return Customer::create(['customer_code' => $code, 'name' => "Toko {$code}", 'salesperson_id' => $salesId, 'active' => $active]);
    }

    private function payload(MarketingBudget $b, array $over = []): array
    {
        return array_merge([
            'marketing_budget_id' => $b->id, 'description' => 'Bazaar Ramadan', 'reference_letter_no' => 'SK/001/2026',
            'activity_type' => 'EVENT', 'start_date' => '2026-11-01', 'end_date' => '2026-11-30',
            'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ], $over);
    }

    public function test_a_national_event_includes_every_active_customer_and_counts_against_the_budget(): void
    {
        $this->as('supervisor');
        $b = $this->budget();
        $this->customer('C1');
        $this->customer('C2');
        $this->customer('OFF', null, false);

        $r = $this->postJson('/api/v1/marketing/events', $this->payload($b))->assertStatus(201);

        $this->assertSame('PENDING_APPROVAL', $r->json('data.status'));
        $this->assertSame('BDG-2026-001-E01', $r->json('data.event_code'));
        $this->assertSame(2, $r->json('data.participants_count'));
        $this->assertSame(400000.0, (float) $b->fresh()->allocated_amount);
        $this->assertSame(600000.0, (float) $b->fresh()->remaining_budget);
    }

    public function test_the_event_sequence_increases_per_campaign(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');

        $this->postJson('/api/v1/marketing/events', $this->payload($b))->assertStatus(201);
        $second = $this->postJson('/api/v1/marketing/events', $this->payload($b, ['reference_letter_no' => 'SK/002/2026', 'budget_amount' => 100000]))->assertStatus(201);

        $this->assertSame('BDG-2026-001-E02', $second->json('data.event_code'));
        $this->assertSame(500000.0, (float) $b->fresh()->allocated_amount);
    }

    public function test_a_territory_event_only_includes_customers_of_sales_in_that_territory(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $jkt = User::factory()->create(['role' => 'sales', 'active' => true, 'territory' => 'Jakarta']);
        $sby = User::factory()->create(['role' => 'sales', 'active' => true, 'territory' => 'Surabaya']);
        $this->customer('J1', $jkt->id);
        $this->customer('J2', $jkt->id);
        $this->customer('S1', $sby->id);

        $r = $this->postJson('/api/v1/marketing/events', $this->payload($b, ['target_type' => 'TERRITORY', 'territories' => ['Jakarta']]))->assertStatus(201);

        $this->assertSame(2, $r->json('data.participants_count'));
        $this->assertSame(['Jakarta'], $r->json('data.target_territories'));
        $this->assertEqualsCanonicalizing(['J1', 'J2'], array_column($r->json('data.participants'), 'customer_code'));
    }

    public function test_a_territory_without_customers_is_rejected_and_nothing_is_saved(): void
    {
        $this->as('admin');
        $b = $this->budget();
        User::factory()->create(['role' => 'sales', 'active' => true, 'territory' => 'Medan']);

        $this->postJson('/api/v1/marketing/events', $this->payload($b, ['target_type' => 'TERRITORY', 'territories' => ['Medan']]))->assertStatus(422);

        $this->assertSame(0, MarketingEvent::count());
        $this->assertSame(0.0, (float) $b->fresh()->allocated_amount);
    }

    public function test_a_customer_event_uses_exactly_the_chosen_customers(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $a = $this->customer('A');
        $this->customer('B');

        $r = $this->postJson('/api/v1/marketing/events', $this->payload($b, ['target_type' => 'CUSTOMER', 'customer_ids' => [$a->id]]))->assertStatus(201);

        $this->assertSame(1, $r->json('data.participants_count'));
        $this->assertSame('A', $r->json('data.participants.0.customer_code'));
    }

    public function test_an_event_above_the_remaining_budget_is_rejected(): void
    {
        $this->as('admin');
        $b = $this->budget(); // total 1.000.000
        $this->customer('C1');
        $this->postJson('/api/v1/marketing/events', $this->payload($b, ['budget_amount' => 700000]))->assertStatus(201);

        $this->postJson('/api/v1/marketing/events', $this->payload($b, ['reference_letter_no' => 'SK/002/2026', 'budget_amount' => 400000]))->assertStatus(422);
        $this->assertSame(1, MarketingEvent::count());
        $this->assertSame(700000.0, (float) $b->fresh()->allocated_amount);

        $this->postJson('/api/v1/marketing/events', $this->payload($b, ['reference_letter_no' => 'SK/003/2026', 'budget_amount' => 300000]))->assertStatus(201);
        $this->assertSame(0.0, (float) $b->fresh()->remaining_budget);
    }

    public function test_a_closed_campaign_cannot_get_new_events(): void
    {
        $this->as('admin');
        $b = $this->budget(['status' => 'CLOSED']);
        $this->customer('C1');

        $this->postJson('/api/v1/marketing/events', $this->payload($b))->assertStatus(422);
    }

    public function test_the_reference_letter_number_must_be_unique(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $this->postJson('/api/v1/marketing/events', $this->payload($b))->assertStatus(201);

        $this->postJson('/api/v1/marketing/events', $this->payload($b, ['budget_amount' => 1000]))->assertStatus(422);
    }

    public function test_the_end_date_cannot_be_before_the_start_date(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');

        $this->postJson('/api/v1/marketing/events', $this->payload($b, ['start_date' => '2026-12-01', 'end_date' => '2026-11-01']))->assertStatus(422);
    }

    public function test_an_unknown_activity_type_is_rejected(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');

        $this->postJson('/api/v1/marketing/events', $this->payload($b, ['activity_type' => 'LAINNYA']))->assertStatus(422);
    }

    public function test_supporting_files_are_stored_with_the_event(): void
    {
        Storage::fake('public');
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');

        $r = $this->postJson('/api/v1/marketing/events', $this->payload($b) + [
            'attachments' => [UploadedFile::fake()->create('rab.pdf', 100, 'application/pdf')],
        ])->assertStatus(201);

        $this->assertSame('rab.pdf', $r->json('data.attachments.0.filename'));
        $this->assertTrue(Storage::disk('public')->exists($r->json('data.attachments.0.path')));
    }

    public function test_sales_cannot_use_event_entry(): void
    {
        $this->as('sales');
        $b = $this->budget();

        $this->getJson('/api/v1/marketing/events')->assertStatus(403);
        $this->postJson('/api/v1/marketing/events', $this->payload($b))->assertStatus(403);
        $this->getJson('/api/v1/marketing/event-options')->assertStatus(403);
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/marketing/events')->assertStatus(401);
    }

    public function test_the_list_can_be_filtered_by_campaign(): void
    {
        $this->as('admin');
        $a = $this->budget();
        $b = $this->budget(['campaign_code' => 'BDG-2026-002']);
        $this->customer('C1');
        $this->postJson('/api/v1/marketing/events', $this->payload($a));
        $this->postJson('/api/v1/marketing/events', $this->payload($b, ['reference_letter_no' => 'SK/009']));

        $r = $this->getJson('/api/v1/marketing/events?marketing_budget_id='.$b->id)->assertOk();

        $this->assertCount(1, $r->json('data'));
        $this->assertSame('BDG-2026-002-E01', $r->json('data.0.event_code'));
    }

    public function test_options_list_activity_types_territories_and_searchable_customers(): void
    {
        $this->as('admin');
        User::factory()->create(['role' => 'sales', 'active' => true, 'territory' => 'Jakarta']);
        User::factory()->create(['role' => 'sales', 'active' => true, 'territory' => 'Jakarta']);
        User::factory()->create(['role' => 'supervisor', 'active' => true, 'territory' => 'Medan']); // bukan sales: tidak ikut pilihan
        $this->customer('KRM-1');
        $this->customer('XYZ-9');

        $r = $this->getJson('/api/v1/marketing/event-options?q=KRM')->assertOk();

        $this->assertSame(['EVENT', 'BRANDING', 'NON_KLAIM'], array_column($r->json('data.activity_types'), 'value'));
        $this->assertSame(['Jakarta'], $r->json('data.territories'));
        $this->assertSame(['KRM-1'], array_column($r->json('data.customers'), 'customer_code'));
    }

    public function test_selecting_only_some_columns_does_not_break_the_computed_labels(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $this->postJson('/api/v1/marketing/events', $this->payload($b))->assertStatus(201);

        $rows = MarketingEvent::get(['id', 'description', 'status'])->toArray();

        $this->assertSame('Bazaar Ramadan', $rows[0]['description']);
        $this->assertNull($rows[0]['activity_type_label']);
        $this->assertNull($rows[0]['event_code']);
    }

    public function test_the_detail_shows_participants_and_an_unknown_event_returns_404(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $id = $this->postJson('/api/v1/marketing/events', $this->payload($b))->json('data.id');

        $this->getJson("/api/v1/marketing/events/{$id}")->assertOk()->assertJsonPath('data.participants_count', 1);
        $this->getJson('/api/v1/marketing/events/999')->assertStatus(404);
    }
}