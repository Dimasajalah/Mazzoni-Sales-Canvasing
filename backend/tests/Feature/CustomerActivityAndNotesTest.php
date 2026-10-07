<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use App\Models\Visit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 4 (hasil meeting Okt 2026): detail customer menampilkan total kunjungan & status kunjungan
 * terakhir. Poin 5: ada tempat catatan bebas untuk sales di detail customer.
 */
class CustomerActivityAndNotesTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function customer(User $owner): Customer
    {
        return Customer::create([
            'customer_code' => 'C-ACT-1', 'name' => 'PT Aktivitas Uji', 'salesperson_id' => $owner->id,
            'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_customer_detail_includes_total_visits_and_the_latest_one_first(): void
    {
        $user = $this->sales();
        $customer = $this->customer($user);

        Visit::create([
            'customer_id' => $customer->id, 'salesperson_id' => $user->id,
            'checkin_at' => now()->subDays(5), 'checkout_at' => now()->subDays(5)->addMinutes(20),
            'visit_result' => 'ORDER',
        ]);
        $latest = Visit::create([
            'customer_id' => $customer->id, 'salesperson_id' => $user->id,
            'checkin_at' => now()->subDay(), 'checkout_at' => now()->subDay()->addMinutes(10),
            'visit_result' => 'NO_ORDER',
        ]);

        $res = $this->getJson("/api/v1/customers/{$customer->id}")->assertOk();

        $this->assertCount(2, $res->json('data.visits'));
        // terurut terbaru dulu -> kunjungan paling akhir ada di index 0
        $this->assertSame($latest->id, $res->json('data.visits.0.id'));
        $this->assertSame('NO_ORDER', $res->json('data.visits.0.visit_result'));
    }

    public function test_customer_without_any_visit_returns_empty_list_not_error(): void
    {
        $user = $this->sales();
        $customer = $this->customer($user);

        $res = $this->getJson("/api/v1/customers/{$customer->id}")->assertOk();

        $this->assertSame([], $res->json('data.visits'));
    }

    public function test_sales_notes_can_be_saved_and_updated(): void
    {
        $user = $this->sales();
        $customer = $this->customer($user);

        $this->patchJson("/api/v1/customers/{$customer->id}", ['sales_notes' => 'Pemilik toko sering tutup siang hari'])
            ->assertOk()
            ->assertJsonPath('data.sales_notes', 'Pemilik toko sering tutup siang hari');

        $this->assertSame(
            'Pemilik toko sering tutup siang hari',
            Customer::find($customer->id)->sales_notes
        );

        // bisa diubah lagi
        $this->patchJson("/api/v1/customers/{$customer->id}", ['sales_notes' => 'Update: sudah buka normal'])
            ->assertOk()->assertJsonPath('data.sales_notes', 'Update: sudah buka normal');
    }

    public function test_sales_notes_accepted_on_create_too(): void
    {
        $this->sales();

        $res = $this->postJson('/api/v1/customers', [
            'customer_code' => 'C-ACT-2', 'name' => 'PT Baru', 'sales_notes' => 'Catatan awal',
        ])->assertCreated();

        $res->assertJsonPath('data.sales_notes', 'Catatan awal');
    }
}