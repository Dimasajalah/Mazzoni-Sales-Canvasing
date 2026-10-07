<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\TaskSet;
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

    /**
     * Hasil meeting lanjutan: sales harus bisa check-in LANGSUNG ke sebuah Lead yang baru
     * didaftarkan — belum tentu sudah punya Customer (itu baru terbentuk setelah Brand Awareness
     * dijawab "Tertarik"). Check-in ke Lead mengembalikan tugas Canvassing aktifnya sekaligus,
     * supaya frontend bisa langsung tampilkan panel tugas tanpa permintaan terpisah.
     */
    public function test_checkin_to_a_lead_directly_without_a_customer_yet(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'UD Lead Checkin', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'latitude' => -7.2575, 'longitude' => 112.7521, 'register_date' => now()->toDateString(),
        ]);
        app(\App\Services\LeadTaskService::class)->spawnFirstTask($lead, $user);

        $response = $this->postJson('/api/v1/visits/checkin', [
            'lead_id' => $lead->id, 'latitude' => -7.2570, 'longitude' => 112.7521, 'accuracy' => 8,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.lead_id', $lead->id)
            ->assertJsonPath('data.customer_id', null)
            ->assertJsonPath('data.lead.current_task.name', 'Brand Awareness');

        $this->assertDatabaseHas('visits', ['lead_id' => $lead->id, 'customer_id' => null]);
    }

    public function test_checkin_rejected_when_both_customer_and_lead_given(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'UD Dua-duanya', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'latitude' => -7.25, 'longitude' => 112.75, 'register_date' => now()->toDateString(),
        ]);
        $customer = Customer::create([
            'customer_code' => 'C-BOTH', 'name' => 'PT Dua-duanya', 'latitude' => -7.25, 'longitude' => 112.75,
            'salesperson_id' => $user->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);

        $this->postJson('/api/v1/visits/checkin', [
            'customer_id' => $customer->id, 'lead_id' => $lead->id, 'latitude' => -7.25, 'longitude' => 112.75,
        ])->assertStatus(422)->assertJsonValidationErrors('lead_id');
    }

    public function test_checkin_rejected_when_neither_customer_nor_lead_given(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/visits/checkin', ['latitude' => -7.25, 'longitude' => 112.75])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['customer_id', 'lead_id']);
    }

    public function test_lead_without_coordinates_cannot_be_checked_into(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'UD Tanpa Lokasi', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);

        $this->postJson('/api/v1/visits/checkin', ['lead_id' => $lead->id, 'latitude' => -7.25, 'longitude' => 112.75])
            ->assertStatus(422)->assertJsonValidationErrors('lead_id');
    }
}