<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\Quote;
use App\Models\TaskSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 12 (hasil meeting Okt 2026): form Brand dan Feedback Sample, kalau dikaitkan ke sebuah
 * tugas (lead_task_id), LANGSUNG menyelesaikan tugas itu dengan Conclusion + Reason Code sendiri
 * — tidak perlu lagi dibuka "Selesaikan Tugas" terpisah setelahnya.
 */
class ActionConcludesTaskTest extends TestCase
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

        return $this->postJson('/api/v1/leads', ['business_name' => 'UD Aksi Uji', 'task_set_id' => $b2b->id])
            ->assertCreated()->json('data');
    }

    public function test_brand_interested_concludes_brand_task_and_spawns_sample(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $taskId = $lead['current_task']['id'];

        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $taskId,
        ])->assertCreated();

        $brandTask = LeadTask::find($taskId);
        $this->assertSame('DONE', $brandTask->status);
        $this->assertSame('NEXT', $brandTask->conclusion);
        $this->assertSame('Tertarik', $brandTask->reason_code);

        $this->assertSame('Sample', $res->json('data.lead.current_task.name'));
        $this->assertSame(Lead::STATUS_SAMPLING, $res->json('data.lead.status_customer'));
    }

    public function test_brand_not_interested_concludes_task_and_closes_lead_fully(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $taskId = $lead['current_task']['id'];

        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'NOT_INTERESTED', 'lead_task_id' => $taskId,
        ])->assertCreated();

        $task = LeadTask::find($taskId);
        $this->assertSame('DONE', $task->status);
        $this->assertSame('LOSE', $task->conclusion);
        $this->assertSame('Tidak Tertarik', $task->reason_code);

        // Poin 12: LOSE lewat form ini sekarang menutup lead PENUH (bukan cuma status_customer saja)
        $this->assertSame('LOSE', $res->json('data.lead.win_loss'));
        $this->assertNotNull($res->json('data.lead.closed_at'));
        $this->assertNull($res->json('data.lead.current_task'));
    }

    private function moveToSample(array $lead): int
    {
        $brandTaskId = $lead['current_task']['id'];
        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED', 'lead_task_id' => $brandTaskId,
        ]);

        return $res->json('data.lead.current_task.id');
    }

    public function test_sample_feedback_interest_concludes_sample_task_and_moves_to_quotation(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $sampleTaskId = $this->moveToSample($lead);

        $res = $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $lead['id'], 'lead_task_id' => $sampleTaskId,
            'product_group' => 'Saus Sambal', 'qty' => 200, 'batch_number' => 'B-1',
            'storage_location' => 'Gudang A', 'feedback_type' => 'interest',
        ])->assertCreated();

        $task = LeadTask::find($sampleTaskId);
        $this->assertSame('NEXT', $task->conclusion);
        $this->assertSame('Sample Cocok', $task->reason_code);
        $this->assertSame('Quotation', $res->json('data.lead.current_task.name'));
        $this->assertSame(Lead::STATUS_QUOTATION, $res->json('data.lead.status_customer'));

        // Bug ditemukan lewat tes manual: tombol "Penawaran" selalu mengira belum ada penawaran
        // sama sekali (membuka form kosong baru) karena lead yang maju lewat form Brand/Sample
        // (poin 12) tidak pernah dapat Quote otomatis seperti jalur conclude() manual.
        // Bug ditemukan lewat tes manual: tombol "Penawaran" selalu mengira belum ada penawaran
        // sama sekali (membuka form kosong baru) karena lead yang maju lewat form Brand/Sample
        // (poin 12) tidak pernah dapat Quote otomatis seperti jalur conclude() manual.
        $this->assertDatabaseHas('quotes', ['lead_id' => $lead['id']]);
        $this->getJson("/api/v1/quotes?lead_id={$lead['id']}")
            ->assertOk()->assertJsonCount(1, 'data.data');

        // Bug kedua ditemukan lewat tes manual: nomor penawaran terbit sejak Brand Awareness
        // (sebelum sample ada), dan alur Feedback Sample (poin 12) hanya membuat
        // ProductSampleFeedback, TIDAK pernah membuat ProductSample sama sekali — jadi product
        // group sample tidak boleh cuma dicari lewat relasi product_sample_id (selalu null di
        // alur ini), harus dicari dari ProductSampleFeedback milik lead ini juga.
        $quoteId = Quote::where('lead_id', $lead['id'])->value('id');
        $this->getJson("/api/v1/quotes/{$quoteId}")
            ->assertOk()->assertJsonPath('data.sample_product_group', 'Saus Sambal');
    }

    public function test_sample_feedback_revision_loops_back_to_a_new_sample_task(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $sampleTaskId = $this->moveToSample($lead);

        $res = $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $lead['id'], 'lead_task_id' => $sampleTaskId,
            'product_group' => 'Saus Sambal', 'qty' => 200, 'batch_number' => 'B-1',
            'storage_location' => 'Gudang A', 'feedback_type' => 'revision', 'notes' => 'Kurang pedas',
            'revision_types' => ['rasa'],
        ])->assertCreated();

        $task = LeadTask::find($sampleTaskId);
        $this->assertSame('NEXT', $task->conclusion);
        $this->assertSame('Sample Direvisi', $task->reason_code);

        // tugas baru: Sample lagi (loop), bukan Quotation; status_customer tetap Sampling
        $this->assertSame('Sample', $res->json('data.lead.current_task.name'));
        $this->assertNotSame($sampleTaskId, $res->json('data.lead.current_task.id'));
        $this->assertSame(Lead::STATUS_SAMPLING, $res->json('data.lead.status_customer'));
    }

    public function test_sample_feedback_not_interest_closes_lead_fully(): void
    {
        $this->sales();
        $lead = $this->newB2bLead();
        $sampleTaskId = $this->moveToSample($lead);

        $res = $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $lead['id'], 'lead_task_id' => $sampleTaskId,
            'product_group' => 'Saus Sambal', 'qty' => 200, 'batch_number' => 'B-1',
            'storage_location' => 'Gudang A', 'feedback_type' => 'not_interest', 'notes' => 'Tidak sesuai selera',
        ])->assertCreated();

        $task = LeadTask::find($sampleTaskId);
        $this->assertSame('LOSE', $task->conclusion);
        $this->assertSame('Sample Ditolak', $task->reason_code);
        $this->assertSame('LOSE', $res->json('data.lead.win_loss'));
        $this->assertNull($res->json('data.lead.current_task'));
    }

    public function test_without_lead_task_id_still_falls_back_to_direct_status_update(): void
    {
        $this->sales();
        // Lead tanpa Task Set -> tidak ada current_task, lead_task_id tidak dikirim
        $lead = $this->postJson('/api/v1/leads', ['business_name' => 'UD Tanpa Task Set'])
            ->assertCreated()->json('data');

        $res = $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND', 'decision' => 'INTERESTED',
        ])->assertCreated();

        $this->assertSame(Lead::STATUS_SAMPLING, $res->json('data.lead.status_customer'));
    }
}