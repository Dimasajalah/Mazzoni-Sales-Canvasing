<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\TaskSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Revisi tim functional (Okt 2026): "Conclusion & Reason Code dipilih MANUAL oleh sales" —
 * form Brand/Feedback Sample dengan manual_conclude=true HANYA mencatat keputusan (data/histori),
 * TIDAK lagi otomatis menyelesaikan tugas. Sales menyelesaikan tugas lewat concludeLeadTask()
 * terpisah (field Conclusion/Reason Code/Tugas berikutnya ada di form yang sama, lihat frontend).
 */
class ManualConclusionRevisionTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function newB2bLead(): array
    {
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();

        return $this->postJson('/api/v1/leads', ['business_name' => 'UD Manual Conclude', 'task_set_id' => $b2b->id])
            ->assertCreated()->json('data');
    }

    public function test_brand_form_with_manual_conclude_does_not_touch_the_task_or_status(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $taskId = $lead['current_task']['id'];

        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $taskId, 'manual_conclude' => true,
        ])->assertCreated();

        // journey entry tetap tercatat (data/histori)...
        $this->assertDatabaseHas('lead_journey_entries', ['lead_id' => $lead['id'], 'decision' => 'INTERESTED']);

        // ...tapi tugas Brand Awareness TIDAK ikut selesai, tugas aktif TIDAK berubah
        $task = LeadTask::find($taskId);
        $this->assertSame('OPEN', $task->status);
        $this->assertNull($task->conclusion);
        $this->assertSame('Brand Awareness', $res->json('data.lead.current_task.name'));
        $this->assertSame(Lead::STATUS_PROSPEK, $res->json('data.lead.status_customer'));
    }

    public function test_brand_interested_with_manual_conclude_still_creates_the_customer(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $taskId = $lead['current_task']['id'];

        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $taskId, 'manual_conclude' => true,
        ])->assertCreated();

        // Customer tetap otomatis terbentuk -- ini independen dari siapa yang conclude tugasnya
        $this->assertNotNull($res->json('data.lead.customer_id'));
    }

    public function test_brand_not_interested_with_manual_conclude_does_not_close_the_lead(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $taskId = $lead['current_task']['id'];

        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'NOT_INTERESTED', 'lead_task_id' => $taskId, 'manual_conclude' => true,
        ])->assertCreated();

        $this->assertSame('OPEN', $res->json('data.lead.win_loss'));
        $this->assertNull($res->json('data.lead.closed_at'));
        $this->assertSame('Brand Awareness', $res->json('data.lead.current_task.name'));
    }

    public function test_journey_entry_without_manual_conclude_keeps_the_old_automatic_behaviour(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $taskId = $lead['current_task']['id'];

        // klien lama yang belum update -> tetap auto-conclude seperti sebelumnya (kompatibilitas)
        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $taskId,
        ])->assertCreated();

        $this->assertSame('Sample', $res->json('data.lead.current_task.name'));
        $this->assertSame('DONE', LeadTask::find($taskId)->status);
    }

    private function moveToSampleManually(array $lead): int
    {
        $brandTaskId = $lead['current_task']['id'];
        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $brandTaskId,
        ]);

        return LeadTask::where('lead_id', $lead['id'])->where('name', 'Sample')->value('id');
    }

    public function test_sample_feedback_with_manual_conclude_does_not_touch_the_task_or_status(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $sampleTaskId = $this->moveToSampleManually($lead);

        $res = $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $lead['id'], 'lead_task_id' => $sampleTaskId, 'manual_conclude' => true,
            'product_group' => 'Saus Sambal', 'qty' => 200, 'batch_number' => 'B-1', 'feedback_type' => 'interest',
        ])->assertCreated();

        $this->assertDatabaseHas('product_sample_feedbacks', ['lead_task_id' => $sampleTaskId, 'feedback_type' => 'interest']);

        $task = LeadTask::find($sampleTaskId);
        $this->assertSame('OPEN', $task->status);
        $this->assertSame('Sample', $res->json('data.lead.current_task.name'));
        $this->assertSame(Lead::STATUS_SAMPLING, $res->json('data.lead.status_customer'));
    }

    public function test_sample_feedback_without_manual_conclude_keeps_the_old_automatic_behaviour(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $sampleTaskId = $this->moveToSampleManually($lead);

        $res = $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $lead['id'], 'lead_task_id' => $sampleTaskId,
            'product_group' => 'Saus Sambal', 'qty' => 200, 'batch_number' => 'B-1', 'feedback_type' => 'interest',
        ])->assertCreated();

        $this->assertSame('Quotation', $res->json('data.lead.current_task.name'));
    }

    public function test_now_sales_concludes_the_task_manually_via_the_existing_conclude_endpoint(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $taskId = $lead['current_task']['id'];

        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $taskId, 'manual_conclude' => true,
        ])->assertCreated();

        $template = \App\Models\TaskTemplate::where('pipeline_step', 'sampling')
            ->whereHas('taskSet', fn ($q) => $q->where('code', 'B2B'))->firstOrFail();

        $res = $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", [
            'conclusion' => 'NEXT', 'reason_code' => 'Tertarik', 'next_template_id' => $template->id,
        ])->assertOk();

        $this->assertSame('Sample', $res->json('data.next_task.name'));
        $this->assertSame('DONE', LeadTask::find($taskId)->status);
    }
}