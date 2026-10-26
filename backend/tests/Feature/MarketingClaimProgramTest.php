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

/** Blueprint MJU 3.2.4 / MKT04: Program Klaim Entry. */
class MarketingClaimProgramTest extends TestCase
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

    private function customer(string $code, ?int $salesId = null): Customer
    {
        return Customer::create(['customer_code' => $code, 'name' => "Toko {$code}", 'salesperson_id' => $salesId, 'active' => true]);
    }

    private function payload(MarketingBudget $b, array $over = []): array
    {
        return array_merge([
            'marketing_budget_id' => $b->id, 'description' => 'Diskon Saus Q4', 'reference_letter_no' => 'SKP/001/2026',
            'claim_type' => 'DISKON_PRODUK', 'claim_source' => 'SELL_OUT', 'claim_basis' => 'SALES_VALUE',
            'claim_threshold' => 5000000, 'claim_rate_type' => 'PERCENT', 'claim_rate' => 2.5,
            'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'claim_deadline' => '2026-12-15',
            'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ], $over);
    }

    public function test_a_claim_program_is_saved_as_a_klaim_activity_with_its_parameters(): void
    {
        $this->as('supervisor');
        $b = $this->budget();
        $this->customer('C1');
        $this->customer('C2');

        $r = $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b))->assertStatus(201);

        $this->assertSame('KLAIM', $r->json('data.activity_type'));
        $this->assertSame('Klaim', $r->json('data.activity_type_label'));
        $this->assertSame('BDG-2026-001-K01', $r->json('data.event_code'));
        $this->assertSame('PENDING_APPROVAL', $r->json('data.status'));
        $this->assertSame('DISKON_PRODUK', $r->json('data.claim_type'));
        $this->assertSame('Diskon Produk', $r->json('data.claim_type_label'));
        $this->assertSame('Sell Out', $r->json('data.claim_source_label'));
        $this->assertSame('Nilai Penjualan', $r->json('data.claim_basis_label'));
        $this->assertSame(5000000.0, (float) $r->json('data.claim_threshold'));
        $this->assertSame(2.5, (float) $r->json('data.claim_rate'));
        $this->assertSame('PERCENT', $r->json('data.claim_rate_type'));
        $this->assertSame('2026-12-15', $r->json('data.claim_deadline'));
        $this->assertSame(2, $r->json('data.participants_count'));
    }

    public function test_events_and_claim_programs_share_the_sequence_and_the_campaign_budget(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');

        $event = $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => $b->id, 'description' => 'Bazaar', 'reference_letter_no' => 'SK/001', 'activity_type' => 'EVENT',
            'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 300000,
        ])->assertStatus(201);
        $claim = $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, ['budget_amount' => 200000]))->assertStatus(201);

        $this->assertSame('BDG-2026-001-E01', $event->json('data.event_code'));
        $this->assertSame('BDG-2026-001-K02', $claim->json('data.event_code'));
        $this->assertSame(500000.0, (float) $b->fresh()->allocated_amount);
    }

    public function test_a_claim_program_above_the_remaining_budget_is_rejected(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, ['budget_amount' => 700000]))->assertStatus(201);

        $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, ['reference_letter_no' => 'SKP/002', 'budget_amount' => 400000]))->assertStatus(422);

        $this->assertSame(1, MarketingEvent::count());
        $this->assertSame(700000.0, (float) $b->fresh()->allocated_amount);
    }

    public function test_the_claim_fields_are_required_and_validated(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $post = fn (array $over) => $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, $over));

        $post(['claim_type' => 'LAINNYA'])->assertStatus(422);
        $post(['claim_source' => 'SELL_THRU'])->assertStatus(422);
        $post(['claim_basis' => 'LAINNYA'])->assertStatus(422);
        $post(['claim_rate' => 0])->assertStatus(422);
        $post(['claim_rate_type' => 'LAINNYA'])->assertStatus(422);
        $post(['claim_threshold' => -1])->assertStatus(422);
        $this->assertSame(0, MarketingEvent::count());
    }

    public function test_a_percentage_rate_cannot_exceed_100_but_a_nominal_rate_can(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');

        $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, ['claim_rate' => 120]))->assertStatus(422);
        $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, ['claim_rate' => 120, 'claim_rate_type' => 'AMOUNT']))->assertStatus(201);
    }

    public function test_the_dates_must_be_in_order_and_the_claim_deadline_cannot_precede_the_program_end(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $post = fn (array $over) => $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, $over));

        $post(['start_date' => '2026-12-01', 'end_date' => '2026-11-01'])->assertStatus(422);
        $post(['claim_deadline' => '2026-11-15'])->assertStatus(422);
        $post(['claim_deadline' => '2026-11-30'])->assertStatus(201);
    }

    public function test_the_letter_number_must_be_unique_across_events_and_claim_programs(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b))->assertStatus(201);

        $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, ['budget_amount' => 1000]))->assertStatus(422);
    }

    public function test_a_territory_target_works_like_for_events(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $jkt = User::factory()->create(['role' => 'sales', 'active' => true, 'territory' => 'Jakarta']);
        $this->customer('J1', $jkt->id);
        $this->customer('X1');

        $r = $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b, ['target_type' => 'TERRITORY', 'territories' => ['Jakarta']]))->assertStatus(201);

        $this->assertSame(1, $r->json('data.participants_count'));
        $this->assertSame('J1', $r->json('data.participants.0.customer_code'));
    }

    public function test_the_program_letter_can_be_attached(): void
    {
        Storage::fake('public');
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');

        $r = $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b) + [
            'attachments' => [UploadedFile::fake()->create('surat-program.pdf', 80, 'application/pdf')],
        ])->assertStatus(201);

        $this->assertTrue(Storage::disk('public')->exists($r->json('data.attachments.0.path')));
    }

    public function test_the_event_entry_endpoint_rejects_klaim_as_an_activity_type(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');

        $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => $b->id, 'description' => 'Coba', 'reference_letter_no' => 'SK/9', 'activity_type' => 'KLAIM',
            'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 1000,
        ])->assertStatus(422);
    }

    public function test_each_list_only_shows_its_own_kind(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => $b->id, 'description' => 'Bazaar', 'reference_letter_no' => 'SK/1', 'activity_type' => 'EVENT',
            'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 1000,
        ]);
        $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b));

        $claims = $this->getJson('/api/v1/marketing/claim-programs')->assertOk();
        $events = $this->getJson('/api/v1/marketing/events?kind=EVENT')->assertOk();
        $all = $this->getJson('/api/v1/marketing/events')->assertOk();

        $this->assertSame(['KLAIM'], array_unique(array_column($claims->json('data'), 'activity_type')));
        $this->assertSame(['EVENT'], array_unique(array_column($events->json('data'), 'activity_type')));
        $this->assertCount(2, $all->json('data'));
    }

    public function test_the_detail_is_only_for_claim_programs(): void
    {
        $this->as('admin');
        $b = $this->budget();
        $this->customer('C1');
        $claimId = $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b))->json('data.id');
        $eventId = $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => $b->id, 'description' => 'Bazaar', 'reference_letter_no' => 'SK/1', 'activity_type' => 'EVENT',
            'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 1000,
        ])->json('data.id');

        $this->getJson("/api/v1/marketing/claim-programs/{$claimId}")->assertOk()->assertJsonPath('data.claim_type', 'DISKON_PRODUK');
        $this->getJson("/api/v1/marketing/claim-programs/{$eventId}")->assertStatus(404);
        $this->getJson('/api/v1/marketing/claim-programs/999')->assertStatus(404);
    }

    public function test_the_options_list_claim_types_sources_bases_and_territories(): void
    {
        $this->as('admin');
        User::factory()->create(['role' => 'sales', 'active' => true, 'territory' => 'Jakarta']);
        $this->customer('KRM-1');

        $r = $this->getJson('/api/v1/marketing/claim-program-options?q=KRM')->assertOk();

        $this->assertSame(['DISKON_PRODUK', 'SUBSIDI_DISKON_PARETO', 'REWARD', 'TARGET_GROWTH_OA'], array_column($r->json('data.claim_types'), 'value'));
        $this->assertSame(['SELL_IN', 'SELL_OUT'], array_column($r->json('data.claim_sources'), 'value'));
        $this->assertSame(['SALES_VALUE', 'QUANTITY'], array_column($r->json('data.claim_bases'), 'value'));
        $this->assertContains('Jakarta', $r->json('data.territories'));
        $this->assertSame(['KRM-1'], array_column($r->json('data.customers'), 'customer_code'));
    }

    public function test_sales_cannot_use_claim_program_endpoints_and_login_is_required(): void
    {
        $this->getJson('/api/v1/marketing/claim-programs')->assertStatus(401);

        $this->as('sales');
        $b = $this->budget();
        $this->getJson('/api/v1/marketing/claim-programs')->assertStatus(403);
        $this->getJson('/api/v1/marketing/claim-program-options')->assertStatus(403);
        $this->postJson('/api/v1/marketing/claim-programs', $this->payload($b))->assertStatus(403);
        $this->assertSame(0, MarketingEvent::count());
    }
}