<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 22 (hasil meeting Okt 2026): reformula menaikkan Revision dari kode part yang SAMA
 * (bukan membuat kode part baru / sample baru) — dipakai saat repeat order formula berubah.
 */
class ProductRevisionTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function product(): Product
    {
        return Product::create([
            'part_num' => 'SKJ-1000', 'description' => 'Saus Keju 1kg', 'uom' => 'PCS', 'price' => 52000,
            'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_new_product_starts_at_revision_one(): void
    {
        $this->sales();
        $product = $this->product();
        $this->assertSame(1, $product->fresh()->revision);
    }

    public function test_reformula_bumps_revision_keeping_the_same_part_num(): void
    {
        $this->sales();
        $product = $this->product();

        $res = $this->postJson("/api/v1/products/{$product->id}/revise")->assertOk();

        $res->assertJsonPath('data.revision', 2)->assertJsonPath('data.part_num', 'SKJ-1000');
        $this->assertSame('SKJ-1000', Product::find($product->id)->part_num); // kode part TIDAK berubah
        $this->assertSame(2, Product::find($product->id)->revision);
    }

    public function test_reformula_can_be_applied_repeatedly(): void
    {
        $this->sales();
        $product = $this->product();

        $this->postJson("/api/v1/products/{$product->id}/revise")->assertOk();
        $this->postJson("/api/v1/products/{$product->id}/revise")->assertOk()->assertJsonPath('data.revision', 3);
    }

    public function test_quote_line_product_exposes_revision_number(): void
    {
        $this->sales();
        $product = $this->product();
        $this->postJson("/api/v1/products/{$product->id}/revise"); // revision jadi 2

        $res = $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 1]],
        ])->assertCreated();

        $res->assertJsonPath('data.lines.0.product.revision', 2);
    }
}