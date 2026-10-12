<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use App\Services\LeadTaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Task ID di tugas nyata disalin dari kode template (dokumen hal. 26). */
class LeadTaskCodeTest extends TestCase
{
    use RefreshDatabase;

    public function test_new_tasks_carry_the_code_of_their_template(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'UD Kode', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);

        app(LeadTaskService::class)->spawnFirstTask($lead, $user);
        $this->assertSame('BRANDAW', LeadTask::where('lead_id', $lead->id)->value('code'));

        $noo = TaskTemplate::where('task_set_id', $b2b->id)->where('code', 'VRFKSNOO')->firstOrFail();
        $task = LeadTask::create([
            'lead_id' => $lead->id, 'task_template_id' => $noo->id, 'seq' => $noo->seq, 'name' => $noo->name,
            'task_type' => $noo->task_type, 'stage' => $noo->stage, 'pipeline_step' => $noo->pipeline_step,
        ]);
        $this->assertSame('VRFKSNOO', $task->fresh()->code);
    }
}