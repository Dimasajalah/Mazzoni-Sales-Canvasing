<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Status "In Progress" dan kode alasan SUKSES (contoh di dokumen hal. 28 dan 32) harus diterima saat tugas diselesaikan. */
class TaskStatusInProgressTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_task_can_be_concluded_with_in_progress_status_and_reason_sukses(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $sample = TaskTemplate::where('task_set_id', $b2b->id)->where('pipeline_step', 'sampling')->firstOrFail();
        $quote = TaskTemplate::where('task_set_id', $b2b->id)->where('code', 'CREATEQ')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'UD Status', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);
        $task = LeadTask::create([
            'lead_id' => $lead->id, 'task_template_id' => $sample->id, 'seq' => $sample->seq,
            'name' => $sample->name, 'task_type' => $sample->task_type, 'stage' => $sample->stage,
            'pipeline_step' => $sample->pipeline_step, 'actions' => $sample->actions,
        ]);

        $this->postJson("/api/v1/lead-tasks/{$task->id}/conclude", [
            'conclusion' => 'NEXT',
            'next_template_id' => $quote->id,
            'reason_code' => 'SUKSES',
            'task_status' => 'In Progress',
        ])->assertOk()->assertJsonPath('data.next_task.code', 'CREATEQ');
    }
}