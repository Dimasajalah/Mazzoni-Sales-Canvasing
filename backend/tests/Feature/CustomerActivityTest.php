<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Log aktivitas customer (dokumen hal. 18): kunjungan, tugas selesai, pipeline, sample; terbaru dulu. */
class CustomerActivityTest extends TestCase
{
    use RefreshDatabase;

    private function customerNear(User $user, string $code): Customer
    {
        return Customer::create([
            'customer_code' => $code,
            'name' => 'PT '.$code,
            'city' => 'Surabaya',
            'latitude' => -7.2575,
            'longitude' => 112.7521,
            'salesperson_id' => $user->id,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_activity_lists_visit_entries_newest_first_and_honours_limit(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $customer = $this->customerNear($user, 'C-ACT-01');

        $visitId = $this->postJson('/api/v1/visits/checkin', [
            'customer_id' => $customer->id, 'latitude' => -7.2570, 'longitude' => 112.7521, 'accuracy' => 8,
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/visits/{$visitId}/checkout", ['visit_result' => 'Tidak ada order'])->assertOk();

        $this->getJson("/api/v1/customers/{$customer->id}/activity")
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonPath('data.items.0.kind', 'checkout')
            ->assertJsonPath('data.items.1.kind', 'checkin');

        $this->getJson("/api/v1/customers/{$customer->id}/activity?limit=1")
            ->assertOk()
            ->assertJsonPath('data.total', 2)
            ->assertJsonCount(1, 'data.items');
    }

    public function test_activity_for_a_customer_without_history_is_empty(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $customer = $this->customerNear($user, 'C-ACT-02');

        $this->getJson("/api/v1/customers/{$customer->id}/activity")
            ->assertOk()
            ->assertJsonPath('data.total', 0)
            ->assertJsonCount(0, 'data.items');
    }

    public function test_activity_of_unknown_customer_is_404(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/customers/999999/activity')->assertNotFound();
    }
}