<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Pemberian Sample (dokumen hal. 28): identitas produk Part/Description, Package Size, Qty Given; tanpa Batch. */
class ProductSamplePemberianTest extends TestCase
{
    use RefreshDatabase;

    public function test_pemberian_sample_saves_part_description_and_qty_given_without_a_batch_number(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'sales', 'active' => true]));

        $response = $this->postJson('/api/v1/samples', [
            'product_group' => 'Saus & Condiment',
            'part' => 'CUSTOM-STM-1247',
            'rev' => 'V2',
            'description' => 'Tomato Sauce Custom B2B',
            'qty' => 100, // Package Size (gram)
            'qty_given' => '2 pcs',
            'notes' => 'Batch No. STM-1247-V2',
        ])->assertCreated();

        $response->assertJsonPath('data.part', 'CUSTOM-STM-1247');
        $this->assertDatabaseHas('product_samples', [
            'product_group' => 'Saus & Condiment',
            'part' => 'CUSTOM-STM-1247',
            'rev' => 'V2',
            'description' => 'Tomato Sauce Custom B2B',
            'qty' => 100,
            'qty_given' => '2 pcs',
            'batch_number' => null,
        ]);
    }

    public function test_the_old_pengajuan_form_without_part_still_requires_a_batch_number(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'sales', 'active' => true]));

        $this->postJson('/api/v1/samples', ['product_group' => 'Saus', 'qty' => 50])
            ->assertStatus(422)
            ->assertJsonValidationErrors('batch_number');

        $this->postJson('/api/v1/samples', ['product_group' => 'Saus', 'qty' => 50, 'batch_number' => 'B-01'])
            ->assertCreated();
    }
}