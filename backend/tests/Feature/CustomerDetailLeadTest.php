<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\TaskSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Detail Customer (dokumen hal. 16) membawa lead asalnya: tahap pipeline, potensi, kontak. */
class CustomerDetailLeadTest extends TestCase
{
    use RefreshDatabase;

    private function customer(User $user, string $code): Customer
    {
        return Customer::create([
            'customer_code' => $code,
            'name' => 'PT '.$code,
            'city' => 'Surabaya',
            'salesperson_id' => $user->id,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_customer_detail_includes_the_lead_it_came_from(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = $this->customer($user, 'C-LEAD-01');
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'PT C-LEAD-01', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(), 'customer_id' => $customer->id, 'estimated_value' => 13200000,
        ]);

        $this->getJson('/api/v1/customers/'.$customer->id)
            ->assertOk()
            ->assertJsonPath('data.lead.id', $lead->id)
            ->assertJsonPath('data.lead.customer_id', $customer->id);
    }

    public function test_customer_without_a_lead_has_null_lead(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = $this->customer($user, 'C-NOLEAD-01');

        $this->getJson('/api/v1/customers/'.$customer->id)
            ->assertOk()
            ->assertJsonPath('data.lead', null);
    }
}