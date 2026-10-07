<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Quote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 18/20/21 (hasil meeting Okt 2026): penawaran tidak bisa dijadikan order kalau ada baris
 * dengan produk yang belum teregister (epicor_part_num kosong, masih placeholder sample).
 */
class ProductRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true, 'sales_type' => 'ORDER']);
        Sanctum::actingAs($user);

        return $user;
    }

    private function product(?string $epicorPartNum, ?string $productGroup = null): Product
    {
        return Product::create([
            'part_num' => 'P-'.uniqid(), 'description' => 'Saus Custom B2B', 'uom' => 'PCS', 'price' => 50000,
            'epicor_part_num' => $epicorPartNum, 'product_group' => $productGroup,
            'active' => true, 'sync_status' => $epicorPartNum ? 'NOT_REQUIRED' : 'PENDING',
        ]);
    }

    private function customer(): int
    {
        return \App\Models\Customer::create([
            'customer_code' => 'C-REG-1', 'name' => 'PT Registrasi Uji', 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ])->id;
    }

    public function test_registration_can_be_set_via_endpoint_for_testing(): void
    {
        $this->sales();
        $product = $this->product(null);

        $this->patchJson("/api/v1/products/{$product->id}/registration", [
            'epicor_part_num' => 'EP-00123', 'product_group' => 'Saus Sambal Custom',
        ])->assertOk()
            ->assertJsonPath('data.epicor_part_num', 'EP-00123')
            ->assertJsonPath('data.product_group', 'Saus Sambal Custom');

        $this->assertSame('EP-00123', Product::find($product->id)->epicor_part_num);
    }

    public function test_registration_endpoint_updates_one_field_without_clearing_the_other(): void
    {
        $this->sales();
        $product = $this->product('EP-OLD', 'Grup Lama');

        $this->patchJson("/api/v1/products/{$product->id}/registration", ['product_group' => 'Grup Baru'])
            ->assertOk()->assertJsonPath('data.epicor_part_num', 'EP-OLD')->assertJsonPath('data.product_group', 'Grup Baru');
    }

    public function test_convert_to_order_rejected_when_product_not_registered(): void
    {
        $this->sales();
        $product = $this->product(null, 'Saus Sambal Custom');
        $customerId = $this->customer();

        $quote = $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 1]],
        ])->assertCreated()->json('data');

        $res = $this->postJson("/api/v1/quotes/{$quote['id']}/convert-to-order", ['customer_id' => $customerId])
            ->assertStatus(422);
        $res->assertJsonValidationErrors('quote');
        $this->assertStringContainsString('Saus Sambal Custom', $res->json('errors.quote.0'));
    }

    public function test_convert_to_order_succeeds_when_product_is_registered(): void
    {
        $this->sales();
        $product = $this->product('EP-12345');
        $customerId = $this->customer();

        $quote = $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 1]],
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/quotes/{$quote['id']}/convert-to-order", ['customer_id' => $customerId])
            ->assertCreated();
    }

    public function test_quote_line_product_exposes_registration_fields_for_frontend_flag(): void
    {
        $this->sales();
        $product = $this->product(null, 'Saus Sambal Custom');

        $res = $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 1]],
        ])->assertCreated();

        $res->assertJsonPath('data.lines.0.product.epicor_part_num', null)
            ->assertJsonPath('data.lines.0.product.product_group', 'Saus Sambal Custom');
    }

    public function test_one_unregistered_line_among_several_still_blocks_the_whole_order(): void
    {
        $this->sales();
        $ok = $this->product('EP-999');
        $bad = $this->product(null, 'Produk Belum Terdaftar');
        $customerId = $this->customer();

        $quote = $this->postJson('/api/v1/quotes', [
            'lines' => [
                ['product_id' => $ok->id, 'gramasi_gr' => 1000, 'qty_kg' => 1],
                ['product_id' => $bad->id, 'gramasi_gr' => 1000, 'qty_kg' => 1],
            ],
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/quotes/{$quote['id']}/convert-to-order", ['customer_id' => $customerId])
            ->assertStatus(422);
    }
}