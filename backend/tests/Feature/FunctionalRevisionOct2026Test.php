<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\Product;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Revisi tim functional (Okt 2026): pengajuan Sample/Feedback masuk ke Customer lead-nya,
 * Product Group harus dipilih dari daftar, dan aksi Negosiasi dihilangkan dari tugas.
 */
class FunctionalRevisionOct2026Test extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function leadWithCustomer(): array
    {
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = $this->postJson('/api/v1/leads', ['business_name' => 'UD Masuk Customer', 'task_set_id' => $b2b->id])
            ->assertCreated()->json('data');

        // Brand "Tertarik" membentuk Customer + tugas Sample
        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $lead['current_task']['id'],
        ])->assertCreated();

        return [
            'lead_id' => $lead['id'],
            'customer_id' => $res->json('data.lead.customer_id'),
            'sample_task_id' => $res->json('data.lead.current_task.id'),
        ];
    }

    public function test_sample_for_a_lead_is_recorded_under_the_leads_customer(): void
    {
        $this->sales();
        $ctx = $this->leadWithCustomer();
        $this->assertNotNull($ctx['customer_id']);

        // klien SALAH mengirim customer lain (bug lama: form memilih customer pertama di daftar)
        $other = \App\Models\Customer::create([
            'customer_code' => 'C-LAIN', 'name' => 'PT Salah Pilih', 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);

        $this->postJson('/api/v1/samples', [
            'lead_id' => $ctx['lead_id'], 'lead_task_id' => $ctx['sample_task_id'], 'customer_id' => $other->id,
            'product_group' => 'Saus Sambal', 'qty' => 500, 'batch_number' => 'B-1',
        ])->assertCreated()->assertJsonPath('data.customer_id', $ctx['customer_id']);
    }

    public function test_sample_feedback_for_a_lead_is_recorded_under_the_leads_customer(): void
    {
        $this->sales();
        $ctx = $this->leadWithCustomer();

        $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $ctx['lead_id'], 'lead_task_id' => $ctx['sample_task_id'],
            'product_group' => 'Saus Sambal', 'qty' => 500, 'batch_number' => 'B-1', 'feedback_type' => 'interest',
        ])->assertCreated()->assertJsonPath('data.feedback.customer_id', $ctx['customer_id']);
    }

    public function test_sample_without_a_lead_keeps_the_customer_sent_by_the_client(): void
    {
        $this->sales();
        $customer = \App\Models\Customer::create([
            'customer_code' => 'C-MANDIRI', 'name' => 'PT Mandiri', 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);

        $this->postJson('/api/v1/samples', [
            'customer_id' => $customer->id, 'product_group' => 'Saus Sambal', 'qty' => 100, 'batch_number' => 'B-2',
        ])->assertCreated()->assertJsonPath('data.customer_id', $customer->id);
    }

    private function product(string $name, ?string $group, bool $active = true): Product
    {
        return Product::create([
            'part_num' => 'P-'.uniqid(), 'description' => $name, 'uom' => 'PCS', 'price' => 1000,
            'product_group' => $group, 'active' => $active, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_product_groups_endpoint_lists_distinct_sorted_active_groups_only(): void
    {
        $this->sales();
        $this->product('A1', 'Saus Sambal');
        $this->product('A2', 'Saus Sambal');          // duplikat -> muncul sekali
        $this->product('B1', 'Kecap');
        $this->product('C1', null);                   // tanpa group -> tidak muncul
        $this->product('D1', '');                     // kosong -> tidak muncul
        $this->product('E1', 'Grup Nonaktif', false); // produk nonaktif -> tidak muncul

        $this->getJson('/api/v1/product-groups')->assertOk()->assertExactJson([
            'success' => true, 'message' => 'Success', 'data' => ['Kecap', 'Saus Sambal'],
        ]);
    }

    public function test_quotation_task_template_no_longer_has_negotiation_action(): void
    {
        $quote = TaskTemplate::where('pipeline_step', 'quote')->firstOrFail();
        $this->assertSame(['quote'], $quote->actions);
        $this->assertSame([], TaskTemplate::all()->filter(fn ($t) => in_array('negotiation', $t->actions ?? [], true))->all());
    }

    public function test_new_lead_reaching_quotation_gets_a_task_without_negotiation(): void
    {
        $this->sales();
        $ctx = $this->leadWithCustomer();

        $res = $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $ctx['lead_id'], 'lead_task_id' => $ctx['sample_task_id'],
            'product_group' => 'Saus Sambal', 'qty' => 500, 'batch_number' => 'B-1', 'feedback_type' => 'interest',
        ])->assertCreated();

        $this->assertSame('Quotation', $res->json('data.lead.current_task.name'));
        $this->assertSame(['quote'], $res->json('data.lead.current_task.actions'));
    }

    public function test_migration_strips_negotiation_from_templates_and_already_created_tasks(): void
    {
        $user = $this->sales();
        $set = TaskSet::create(['code' => 'MIG', 'name' => 'Uji Migrasi', 'active' => true]);
        $template = TaskTemplate::create([
            'task_set_id' => $set->id, 'seq' => 10, 'name' => 'Lama', 'task_type' => 'Kunjungan', 'stage' => 'LEAD',
            'pipeline_step' => 'quote', 'actions' => ['quote', 'negotiation'], 'active' => true,
        ]);
        $lead = Lead::create(['business_name' => 'UD Migrasi', 'task_set_id' => $set->id, 'salesperson_id' => $user->id, 'register_date' => now()->toDateString()]);
        $task = \App\Models\LeadTask::create([
            'lead_id' => $lead->id, 'task_template_id' => $template->id, 'seq' => 10, 'name' => 'Lama', 'task_type' => 'Kunjungan',
            'stage' => 'LEAD', 'pipeline_step' => 'quote', 'actions' => ['quote', 'negotiation'], 'status' => 'OPEN', 'pct_complete' => 0,
        ]);

        (require database_path('migrations/2026_10_09_000001_remove_negotiation_action_from_tasks.php'))->up();

        $this->assertSame(['quote'], $template->fresh()->actions);
        $this->assertSame(['quote'], $task->fresh()->actions);
    }
}