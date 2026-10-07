<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Revisi form Pengajuan Sample (poin 8, hasil meeting Okt 2026): Customer, Product Group,
 * Qty (Gram), Batch, Keterangan — menggantikan Varian Rasa (BBQ/Red Hot/Mayonaise) + Version.
 */
class ProductSampleFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_store_requires_product_group_qty_and_batch_number(): void
    {
        $this->sales();

        $this->postJson('/api/v1/samples', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['product_group', 'qty', 'batch_number']);
    }

    public function test_store_succeeds_with_new_fields_and_old_ones_are_optional(): void
    {
        $this->sales();

        $res = $this->postJson('/api/v1/samples', [
            'product_group' => 'Saus Tomat', 'qty' => 500, 'batch_number' => 'B-2026-01',
            'notes' => 'Untuk uji rasa customer baru',
        ])->assertCreated();

        $res->assertJsonPath('data.product_group', 'Saus Tomat')
            ->assertJsonPath('data.qty', 500)
            ->assertJsonPath('data.batch_number', 'B-2026-01')
            ->assertJsonPath('data.flavor_variant', null)
            ->assertJsonPath('data.version', null);
    }

    public function test_old_flavor_variant_and_version_still_accepted_if_sent(): void
    {
        $this->sales();

        // Data lama (mis. dari klien yang belum update) tetap tidak ditolak selama field baru terisi
        $res = $this->postJson('/api/v1/samples', [
            'product_group' => 'Saus Sambal', 'qty' => 250, 'batch_number' => 'B-2026-02',
            'flavor_variant' => 'BBQ', 'version' => 2,
        ])->assertCreated();

        $res->assertJsonPath('data.flavor_variant', 'BBQ')->assertJsonPath('data.version', 2);
    }
}