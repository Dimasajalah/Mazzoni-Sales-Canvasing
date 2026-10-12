<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Pemberian Sample bernomor (dokumen hal. 28): GIVESMPL1, GIVESMPL2, ... per lead. */
class SampleTaskNumberingTest extends TestCase
{
    use RefreshDatabase;

    private function sampleTask(Lead $lead, TaskTemplate $template): LeadTask
    {
        return LeadTask::create([
            'lead_id' => $lead->id, 'task_template_id' => $template->id, 'seq' => $template->seq,
            'name' => $template->name, 'task_type' => $template->task_type, 'stage' => $template->stage,
            'pipeline_step' => $template->pipeline_step,
        ])->fresh();
    }

    public function test_sample_tasks_are_numbered_per_lead(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $template = TaskTemplate::where('task_set_id', $b2b->id)->where('pipeline_step', 'sampling')->firstOrFail();
        $newLead = fn (string $name) => Lead::create([
            'business_name' => $name, 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);
        $leadA = $newLead('UD A');
        $leadB = $newLead('UD B');

        $this->assertSame('GIVESMPL1', $this->sampleTask($leadA, $template)->code);
        $this->assertSame('GIVESMPL2', $this->sampleTask($leadA, $template)->code);
        $this->assertSame('GIVESMPL3', $this->sampleTask($leadA, $template)->code);
        $this->assertSame('GIVESMPL1', $this->sampleTask($leadB, $template)->code); // lead lain mulai dari 1
    }
}