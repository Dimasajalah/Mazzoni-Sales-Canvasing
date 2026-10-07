<?php

namespace Tests\Feature;

use App\Models\TaskSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 9 (hasil meeting Okt 2026): field "Assigned to" di tugas perlu menampilkan NAMA, bukan
 * cuma id mentah seperti sebelumnya — current_task.assignee harus selalu ikut dimuat.
 */
class TaskAssigneeNameTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'name' => 'Budi Santoso', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_lead_response_includes_current_task_assignee_name(): void
    {
        $this->sales();
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();

        $res = $this->postJson('/api/v1/leads', ['business_name' => 'UD Assignee', 'task_set_id' => $b2b->id])
            ->assertCreated();

        $res->assertJsonPath('data.current_task.assigned_to', fn ($id) => $id !== null)
            ->assertJsonPath('data.current_task.assignee.name', 'Budi Santoso');
    }

    public function test_conclude_response_includes_assignee_name_on_both_task_and_next_task(): void
    {
        $this->sales();
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = $this->postJson('/api/v1/leads', ['business_name' => 'UD Assignee 2', 'task_set_id' => $b2b->id])
            ->assertCreated()->json('data');

        $sampleTemplate = \App\Models\TaskTemplate::where('pipeline_step', 'sampling')
            ->where('task_set_id', $b2b->id)->firstOrFail();

        $res = $this->postJson("/api/v1/lead-tasks/{$lead['current_task']['id']}/conclude", [
            'conclusion' => 'NEXT', 'reason_code' => 'Tertarik', 'next_template_id' => $sampleTemplate->id,
        ])->assertOk();

        $res->assertJsonPath('data.task.assignee.name', 'Budi Santoso')
            ->assertJsonPath('data.next_task.assignee.name', 'Budi Santoso');
    }
}