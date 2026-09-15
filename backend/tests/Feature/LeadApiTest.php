<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeadApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_sales_can_create_lead(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/v1/leads', [
            'business_name' => 'UD Baru Jaya',
            'owner_name' => 'Pak Jaya',
            'address' => 'Jl. Merdeka, Surabaya',
            'phone' => '08123456789',
            'business_type' => 'Grosir',
            'latitude' => -7.2575,
            'longitude' => 112.7521,
        ]);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.business_name', 'UD Baru Jaya')
            ->assertJsonPath('data.stage', 'NEW');

        $this->assertDatabaseHas('leads', [
            'business_name' => 'UD Baru Jaya',
            'salesperson_id' => $user->id,
        ]);
    }
}
