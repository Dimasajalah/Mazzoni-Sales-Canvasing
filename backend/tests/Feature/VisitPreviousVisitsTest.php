<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Respons check-in memberi tahu apakah ini check-in ulang (dasar layar Choose Activity, dokumen hal. 24). */
class VisitPreviousVisitsTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkin_response_counts_earlier_visits_to_the_same_target(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-PREV-01', 'name' => 'PT Prev', 'city' => 'Surabaya',
            'latitude' => -7.2575, 'longitude' => 112.7521, 'salesperson_id' => $user->id,
            'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
        $payload = ['customer_id' => $customer->id, 'latitude' => -7.2570, 'longitude' => 112.7521, 'accuracy' => 8];

        $first = $this->postJson('/api/v1/visits/checkin', $payload)
            ->assertCreated()
            ->assertJsonPath('data.previous_visits', 0)
            ->json('data.id');
        $this->postJson("/api/v1/visits/{$first}/checkout", [])->assertOk();

        $this->postJson('/api/v1/visits/checkin', $payload)
            ->assertCreated()
            ->assertJsonPath('data.previous_visits', 1);
    }
}