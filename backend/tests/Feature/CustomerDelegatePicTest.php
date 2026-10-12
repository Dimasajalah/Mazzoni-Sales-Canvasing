<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\TaskSet;
use App\Models\User;
use App\Services\LeadTaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Serah-terima PIC customer (dokumen hal. 20). */
class CustomerDelegatePicTest extends TestCase
{
    use RefreshDatabase;

    private function sales(string $role = 'sales', bool $active = true): User
    {
        return User::factory()->create(['role' => $role, 'active' => $active]);
    }

    private function customerOf(User $owner, string $code = 'C-PIC-01'): Customer
    {
        return Customer::create([
            'customer_code' => $code,
            'name' => 'PT '.$code,
            'city' => 'Surabaya',
            'salesperson_id' => $owner->id,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_current_pic_hands_over_customer_linked_lead_and_open_task(): void
    {
        $from = $this->sales();
        $to = $this->sales();
        Sanctum::actingAs($from);

        $customer = $this->customerOf($from);
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'PT C-PIC-01', 'task_set_id' => $b2b->id, 'salesperson_id' => $from->id,
            'register_date' => now()->toDateString(), 'customer_id' => $customer->id,
        ]);
        app(LeadTaskService::class)->spawnFirstTask($lead, $from);

        $this->postJson("/api/v1/customers/{$customer->id}/delegate-pic", ['to_user_id' => $to->id])
            ->assertOk()
            ->assertJsonPath('data.salesperson_id', $to->id);

        $this->assertDatabaseHas('customers', ['id' => $customer->id, 'salesperson_id' => $to->id]);
        $this->assertDatabaseHas('leads', ['id' => $lead->id, 'salesperson_id' => $to->id]);
        $this->assertSame($to->id, (int) LeadTask::where('lead_id', $lead->id)->where('status', 'OPEN')->value('assigned_to'));
    }

    public function test_another_sales_who_is_not_the_pic_is_rejected(): void
    {
        $owner = $this->sales();
        $stranger = $this->sales();
        $target = $this->sales();
        Sanctum::actingAs($stranger);
        $customer = $this->customerOf($owner, 'C-PIC-02');

        $this->postJson("/api/v1/customers/{$customer->id}/delegate-pic", ['to_user_id' => $target->id])
            ->assertForbidden();

        $this->assertDatabaseHas('customers', ['id' => $customer->id, 'salesperson_id' => $owner->id]);
    }

    public function test_supervisor_can_hand_over_any_customer(): void
    {
        $owner = $this->sales();
        $target = $this->sales();
        Sanctum::actingAs($this->sales('supervisor'));
        $customer = $this->customerOf($owner, 'C-PIC-03');

        $this->postJson("/api/v1/customers/{$customer->id}/delegate-pic", ['to_user_id' => $target->id])
            ->assertOk()
            ->assertJsonPath('data.salesperson_id', $target->id);
    }

    public function test_target_must_be_an_active_sales_and_not_the_current_pic(): void
    {
        $owner = $this->sales();
        Sanctum::actingAs($owner);
        $customer = $this->customerOf($owner, 'C-PIC-04');

        foreach ([$this->sales('admin'), $this->sales('sales', false), $owner] as $bad) {
            $this->postJson("/api/v1/customers/{$customer->id}/delegate-pic", ['to_user_id' => $bad->id])
                ->assertStatus(422);
        }

        $this->assertDatabaseHas('customers', ['id' => $customer->id, 'salesperson_id' => $owner->id]);
    }

    public function test_pic_targets_list_active_sales_without_the_current_pic(): void
    {
        $owner = $this->sales();
        $other = $this->sales();
        $this->sales('sales', false); // tidak aktif -> tidak muncul
        Sanctum::actingAs($owner);
        $customer = $this->customerOf($owner, 'C-PIC-05');

        $ids = collect($this->getJson("/api/v1/customers/{$customer->id}/pic-targets")->assertOk()->json('data'))
            ->pluck('id')->all();

        $this->assertContains($other->id, $ids);
        $this->assertNotContains($owner->id, $ids);
        $this->assertCount(1, $ids);
    }
}