<?php
//backend/tests/Feature/BrandAwarenessCustomerTest.php
namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Hasil meeting Okt 2026: prospek yang dijawab "Tertarik" di Brand Awareness langsung dibuatkan
 * Customer (bukan menunggu Win) dan status_customer maju ke Sampling. "Tidak Tertarik" -> Lose.
 */
class BrandAwarenessCustomerTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true, 'territory' => 'Surabaya']);
        Sanctum::actingAs($user);

        return $user;
    }

    private function newLead(): array
    {
        return $this->postJson('/api/v1/leads', [
            'business_name' => 'UD Tertarik Uji', 'address' => 'Jl. Uji No. 1', 'phone' => '0812000001',
            'email' => 'ud@uji.test', 'npwp' => '01.234.567.8-999.000', 'latitude' => -7.25, 'longitude' => 112.75,
        ])->assertCreated()->json('data');
    }

    public function test_interested_creates_customer_links_it_and_moves_to_sampling(): void
    {
        $this->sales();
        $lead = $this->newLead();
        $this->assertArrayNotHasKey('customer_id', $lead); // belum pernah disentuh -> tidak ada di response create()

        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED',
        ])->assertCreated();

        $updatedLead = $res->json('data.lead');
        $this->assertSame(Lead::STATUS_SAMPLING, $updatedLead['status_customer']);
        $this->assertSame('OPPORTUNITY', $updatedLead['stage']); // derivasi otomatis tetap jalan
        $this->assertNotNull($updatedLead['customer_id']);

        $customer = Customer::find($updatedLead['customer_id']);
        $this->assertNotNull($customer);
        $this->assertSame('UD Tertarik Uji', $customer->name);
        $this->assertSame('Jl. Uji No. 1', $customer->address);
        $this->assertSame('0812000001', $customer->phone);
        $this->assertSame('01.234.567.8-999.000', $customer->npwp);
        $this->assertSame(Lead::find($lead['id'])->salesperson_id, $customer->salesperson_id);
        $this->assertSame('PENDING', $customer->sync_status);
        $this->assertStringStartsWith('CUST-STG-'.now()->format('Y').'-', $customer->customer_code);

        $this->assertTrue(
            LeadActivity::where('lead_id', $lead['id'])->where('activity_type', 'BRAND_AWARENESS')->exists()
        );
    }

    public function test_not_interested_moves_to_lose_without_creating_customer(): void
    {
        $this->sales();
        $lead = $this->newLead();

        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'NOT_INTERESTED', 'reason' => 'Sudah punya pemasok',
        ])->assertCreated();

        $updatedLead = $res->json('data.lead');
        $this->assertSame(Lead::STATUS_LOSE, $updatedLead['status_customer']);
        $this->assertSame('LOSE', $updatedLead['win_loss']);
        $this->assertNull($updatedLead['customer_id']);
        $this->assertSame(0, Customer::count());
    }

    public function test_resubmitting_interested_does_not_create_a_duplicate_customer(): void
    {
        $this->sales();
        $lead = $this->newLead();

        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", ['entry_type' => 'BRAND', 'decision' => 'INTERESTED'])->assertCreated();
        $firstCustomerId = Lead::find($lead['id'])->customer_id;

        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", ['entry_type' => 'BRAND', 'decision' => 'INTERESTED'])->assertCreated();

        $this->assertSame(1, Customer::count());
        $this->assertSame($firstCustomerId, Lead::find($lead['id'])->customer_id);
    }

    public function test_customer_code_sequence_increments_across_multiple_leads(): void
    {
        $this->sales();
        $a = $this->newLead();
        $b = $this->newLead();

        $this->postJson("/api/v1/leads/{$a['id']}/journey-entries", ['entry_type' => 'BRAND', 'decision' => 'INTERESTED'])->assertCreated();
        $this->postJson("/api/v1/leads/{$b['id']}/journey-entries", ['entry_type' => 'BRAND', 'decision' => 'INTERESTED'])->assertCreated();

        $codes = Customer::orderBy('id')->pluck('customer_code')->all();
        $this->assertCount(2, $codes);
        $this->assertNotSame($codes[0], $codes[1]);
        $lastSeq = (int) substr($codes[1], -6);
        $firstSeq = (int) substr($codes[0], -6);
        $this->assertSame($firstSeq + 1, $lastSeq);
    }
    private function b2bLead(): array
    {
        return $this->postJson('/api/v1/leads', [
            'business_name' => 'UD Selesaikan Tugas', 'address' => 'Jl. Uji No. 2', 'phone' => '0812000002',
            'task_set_id' => TaskSet::where('code', 'B2B')->firstOrFail()->id,
        ])->assertCreated()->json('data');
    }

    private function sampleTemplateId(): int
    {
        return TaskTemplate::where('seq', 20)
            ->where('task_set_id', TaskSet::where('code', 'B2B')->firstOrFail()->id)
            ->firstOrFail()->id;
    }

    public function test_concluding_brand_awareness_with_next_creates_customer_via_conclude_endpoint(): void
    {
        $this->sales();
        $lead = $this->b2bLead();

        $this->postJson("/api/v1/lead-tasks/{$lead['current_task']['id']}/conclude", [
            'conclusion' => 'NEXT', 'reason_code' => 'Tertarik', 'next_template_id' => $this->sampleTemplateId(),
        ])->assertOk();

        $fresh = Lead::findOrFail($lead['id']);
        $this->assertNotNull($fresh->customer_id);
        $this->assertSame('UD Selesaikan Tugas', Customer::findOrFail($fresh->customer_id)->name);
        $this->assertSame(1, Customer::count());
    }

    public function test_form_brand_then_conclude_does_not_duplicate_the_customer(): void
    {
        $this->sales();
        $lead = $this->b2bLead();
        $taskId = $lead['current_task']['id'];

        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $taskId, 'manual_conclude' => true,
        ])->assertCreated();
        $firstCustomerId = Lead::findOrFail($lead['id'])->customer_id;

        $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", [
            'conclusion' => 'NEXT', 'reason_code' => 'Sample Cocok', 'next_template_id' => $this->sampleTemplateId(),
        ])->assertOk();

        $this->assertSame(1, Customer::count());
        $this->assertSame($firstCustomerId, Lead::findOrFail($lead['id'])->customer_id);
    }

    public function test_concluding_brand_awareness_with_lose_does_not_create_customer(): void
    {
        $this->sales();
        $lead = $this->b2bLead();

        $this->postJson("/api/v1/lead-tasks/{$lead['current_task']['id']}/conclude", [
            'conclusion' => 'LOSE', 'reason_code' => 'Tidak Tertarik',
        ])->assertOk();

        $this->assertNull(Lead::findOrFail($lead['id'])->customer_id);
        $this->assertSame(0, Customer::count());
    }
}