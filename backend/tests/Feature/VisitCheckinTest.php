<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class VisitCheckinTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkin_rejected_outside_radius(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-TEST-01',
            'name' => 'PT Test Far',
            'city' => 'Surabaya',
            'latitude' => -7.2575,
            'longitude' => 112.7521,
            'salesperson_id' => $user->id,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);

        // ~2km away
        $response = $this->postJson('/api/v1/visits/checkin', [
            'customer_id' => $customer->id,
            'latitude' => -7.2750,
            'longitude' => 112.7521,
            'accuracy' => 10,
        ]);

        $response->assertStatus(422)->assertJsonPath('success', false);
        $this->assertDatabaseCount('visits', 0);
    }

    public function test_checkin_allowed_within_radius(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-TEST-02',
            'name' => 'PT Test Near',
            'city' => 'Surabaya',
            'latitude' => -7.2575,
            'longitude' => 112.7521,
            'salesperson_id' => $user->id,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);

        // ~55m north
        $response = $this->postJson('/api/v1/visits/checkin', [
            'customer_id' => $customer->id,
            'latitude' => -7.2570,
            'longitude' => 112.7521,
            'accuracy' => 8,
        ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.customer_id', $customer->id);

        $this->assertDatabaseHas('visits', [
            'customer_id' => $customer->id,
            'salesperson_id' => $user->id,
        ]);
    }
}
