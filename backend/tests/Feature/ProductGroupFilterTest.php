<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 21 (hasil meeting Okt 2026): pencarian produk di Quotation bisa difilter ke Product Group
 * tertentu — dipakai saat lead sudah lewat tahap Sample, supaya produk yang ditawarkan sesuai
 * kategori yang sudah dicoba customer. Filter ini opsional; tanpa parameter, perilaku tetap bebas.
 */
class ProductGroupFilterTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function product(string $name, ?string $group): Product
    {
        return Product::create([
            'part_num' => 'P-'.uniqid(), 'description' => $name, 'uom' => 'PCS', 'price' => 10000,
            'product_group' => $group, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_product_group_filter_only_returns_matching_products(): void
    {
        $this->sales();
        $this->product('Saus Sambal Reguler', 'Saus Sambal Custom');
        $this->product('Saus Sambal Extra Pedas', 'Saus Sambal Custom');
        $this->product('Kecap Manis', 'Kecap');

        $res = $this->getJson('/api/v1/products?product_group=Saus Sambal Custom')->assertOk();

        $names = collect($res->json('data.data'))->pluck('description')->all();
        $this->assertContains('Saus Sambal Reguler', $names);
        $this->assertContains('Saus Sambal Extra Pedas', $names);
        $this->assertNotContains('Kecap Manis', $names);
    }

    public function test_without_product_group_filter_all_products_returned_as_before(): void
    {
        $this->sales();
        $this->product('Saus Sambal', 'Saus Sambal Custom');
        $this->product('Kecap Manis', 'Kecap');

        $res = $this->getJson('/api/v1/products')->assertOk();

        $this->assertCount(2, $res->json('data.data'));
    }

    public function test_product_group_filter_combines_with_text_search(): void
    {
        $this->sales();
        $this->product('Saus Sambal Reguler', 'Saus Sambal Custom');
        $this->product('Saus Sambal Extra Pedas', 'Saus Sambal Custom');

        $res = $this->getJson('/api/v1/products?product_group=Saus Sambal Custom&q=Extra')->assertOk();

        $names = collect($res->json('data.data'))->pluck('description')->all();
        $this->assertSame(['Saus Sambal Extra Pedas'], $names);
    }

    public function test_quote_response_exposes_sample_product_group(): void
    {
        $this->sales();
        $product = $this->product('Saus Sambal Custom', 'Saus Sambal Custom');

        $sample = \App\Models\ProductSample::create([
            'lead_id' => null, 'salesperson_id' => auth()->id(), 'product_name' => 'Saus Sambal Custom',
            'product_group' => 'Saus Sambal Custom', 'qty' => 100, 'batch_number' => 'B-1', 'status' => 'DELIVERED',
        ]);

        $res = $this->postJson('/api/v1/quotes', [
            'product_sample_id' => $sample->id,
            'lines' => [['product_id' => $product->id, 'gramasi_gr' => 1000, 'qty_kg' => 1]],
        ])->assertCreated();

        $res->assertJsonPath('data.sample.product_group', 'Saus Sambal Custom');
    }
}