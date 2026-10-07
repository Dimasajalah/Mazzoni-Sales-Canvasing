<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 17 (hasil meeting Okt 2026): MOQ (Minimum Order Quantity, Kg) untuk produk sample custom
 * B2B tertentu — ditegakkan saat menyimpan baris Quotation.
 */
class MoqTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function productWithMoq(?float $moq): Product
    {
        return Product::create([
            'part_num' => 'P-'.uniqid(), 'description' => 'Saus Custom B2B', 'uom' => 'PCS',
            'price' => 50000, 'moq_kg' => $moq, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_quote_line_below_moq_is_rejected(): void
    {
        $this->sales();
        $product = $this->productWithMoq(50);

        $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 20]],
        ])->assertStatus(422)->assertJsonValidationErrors('lines.0.qty_kg');
    }

    public function test_quote_line_meeting_moq_is_accepted(): void
    {
        $this->sales();
        $product = $this->productWithMoq(50);

        $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 50]],
        ])->assertCreated();
    }

    public function test_product_without_moq_accepts_any_quantity(): void
    {
        $this->sales();
        $product = $this->productWithMoq(null);

        $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 0.5]],
        ])->assertCreated();
    }

    public function test_moq_can_be_set_via_endpoint_for_testing(): void
    {
        $this->sales();
        $product = $this->productWithMoq(null);

        $this->patchJson("/api/v1/products/{$product->id}/moq", ['moq_kg' => 50])
            ->assertOk()->assertJsonPath('data.moq_kg', '50.000');

        $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 20]],
        ])->assertStatus(422)->assertJsonValidationErrors('lines.0.qty_kg');
    }

    public function test_moq_enforced_on_replace_lines_too(): void
    {
        $this->sales();
        $product = $this->productWithMoq(100);
        $ok = $this->productWithMoq(null);

        $quote = $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $ok->id, 'gramasi_gr' => 1000, 'qty_kg' => 1]],
        ])->assertCreated()->json('data');

        $this->putJson("/api/v1/quotes/{$quote['id']}/lines", [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 10]],
        ])->assertStatus(422)->assertJsonValidationErrors('lines.0.qty_kg');
    }
}