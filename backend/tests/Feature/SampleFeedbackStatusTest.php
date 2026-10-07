<?php
//backend/app/Models/ProductSampleFeedback.php
namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Hasil meeting Okt 2026 (poin 10 & 11): hasil Feedback Sample menggerakkan status_customer.
 * Interest (cocok) -> Quotation. Not Interest (tolak) -> Lose. Revision -> tetap Sampling.
 */
class SampleFeedbackStatusTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function leadAtSampling(): array
    {
        $lead = $this->postJson('/api/v1/leads', ['business_name' => 'UD Sample Uji'])
            ->assertCreated()->json('data');

        // Naikkan ke Sampling dulu lewat jalur normal (Brand Awareness tertarik)
        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", ['entry_type' => 'BRAND', 'decision' => 'INTERESTED'])
            ->assertCreated();

        return Lead::find($lead['id'])->fresh()->toArray();
    }

    private function feedback(int $leadId, string $type, array $extra = []): array
    {
        return $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $leadId, 'product_group' => 'Saus Sambal', 'qty' => 200,
            'batch_number' => 'B-1', 'storage_location' => 'Gudang A', 'feedback_type' => $type,
            'notes' => $type !== 'interest' ? 'Catatan wajib untuk hasil tidak oke' : null,
            ...$extra,
        ])->assertCreated()->json('data.lead');
    }

    public function test_interest_moves_lead_to_quotation(): void
    {
        $this->sales();
        $lead = $this->leadAtSampling();

        $updated = $this->feedback($lead['id'], 'interest');

        $this->assertSame(Lead::STATUS_QUOTATION, $updated['status_customer']);
        $this->assertSame('QUOTE', $updated['stage']);
        $this->assertSame('OPEN', $updated['win_loss']);
    }

    public function test_not_interest_moves_lead_to_lose(): void
    {
        $this->sales();
        $lead = $this->leadAtSampling();

        $updated = $this->feedback($lead['id'], 'not_interest');

        $this->assertSame(Lead::STATUS_LOSE, $updated['status_customer']);
        $this->assertSame('LOSE', $updated['win_loss']);
    }

    public function test_revision_keeps_lead_at_sampling(): void
    {
        $this->sales();
        $lead = $this->leadAtSampling();

        $updated = $this->feedback($lead['id'], 'revision', ['revision_types' => ['rasa']]);

        $this->assertSame(Lead::STATUS_SAMPLING, $updated['status_customer']);
        $this->assertSame('OPPORTUNITY', $updated['stage']);
    }

    public function test_feedback_without_lead_id_does_not_error_and_skips_transition(): void
    {
        $this->sales();

        $this->postJson('/api/v1/sample-feedbacks', [
            'product_group' => 'Saus Sambal', 'qty' => 200, 'batch_number' => 'B-2',
            'storage_location' => 'Gudang A', 'feedback_type' => 'interest',
        ])->assertCreated()->assertJsonPath('data.lead', null);
    }

    public function test_sample_feedback_activity_is_logged(): void
    {
        $this->sales();
        $lead = $this->leadAtSampling();

        $this->feedback($lead['id'], 'interest');

        $this->assertTrue(
            LeadActivity::where('lead_id', $lead['id'])->where('activity_type', 'SAMPLE_FEEDBACK')->exists()
        );
    }

    public function test_without_feedback_type_lead_and_status_are_untouched(): void
    {
        $this->sales();
        $lead = $this->leadAtSampling();

        $res = $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $lead['id'], 'product_group' => 'Saus Sambal', 'qty' => 200, 'batch_number' => 'B-3',
        ])->assertCreated();

        $this->assertSame(Lead::STATUS_SAMPLING, $res->json('data.lead.status_customer'));
        $this->assertSame('OPEN', $res->json('data.lead.win_loss'));
    }
}