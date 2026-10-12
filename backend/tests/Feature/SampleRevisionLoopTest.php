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

/** Follow Up Sample (dokumen hal. 30): "perlu revisi" kembali ke Pemberian Sample dengan nomor berikutnya. */
class SampleRevisionLoopTest extends TestCase
{
    use RefreshDatabase;

    public function test_concluding_a_sample_task_with_the_sample_template_opens_the_next_numbered_sample(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $template = TaskTemplate::where('task_set_id', $b2b->id)->where('pipeline_step', 'sampling')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'UD Revisi', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);
        $first = LeadTask::create([
            'lead_id' => $lead->id, 'task_template_id' => $template->id, 'seq' => $template->seq,
            'name' => $template->name, 'task_type' => $template->task_type, 'stage' => $template->stage,
            'pipeline_step' => $template->pipeline_step, 'actions' => $template->actions,
        ]);
        $this->assertSame('GIVESMPL1', $first->fresh()->code);

        $this->postJson("/api/v1/lead-tasks/{$first->id}/conclude", [
            'conclusion' => 'NEXT',
            'next_template_id' => $template->id, // perlu revisi: kembali ke Pemberian Sample
            'reason_code' => 'Sample Cocok',
            'task_status' => 'Process',
        ])
            ->assertOk()
            ->assertJsonPath('data.next_task.code', 'GIVESMPL2');
    }

    public function test_other_tasks_still_cannot_choose_themselves_as_the_next_task(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $brand = TaskTemplate::where('task_set_id', $b2b->id)->where('pipeline_step', 'brand_awareness')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'UD Brand', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);
        $task = LeadTask::create([
            'lead_id' => $lead->id, 'task_template_id' => $brand->id, 'seq' => $brand->seq,
            'name' => $brand->name, 'task_type' => $brand->task_type, 'stage' => $brand->stage,
            'pipeline_step' => $brand->pipeline_step, 'actions' => $brand->actions,
        ]);

        $this->postJson("/api/v1/lead-tasks/{$task->id}/conclude", [
            'conclusion' => 'NEXT',
            'next_template_id' => $brand->id,
        ])->assertStatus(422)->assertJsonValidationErrors('next_template_id');
    }
} 