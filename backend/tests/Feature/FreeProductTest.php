<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesOrder;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Blueprint 5.2.8 (SL08 Free Product): baris Free Product memakai Part yang sama dengan baris berbayar,
 * Unit Price normal, dan sistem membentuk Misc Charge FREEPROD negatif sehingga nilai baris jadi nol.
 */
class FreeProductTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: Customer, 1: Product} */
    private function fixtures(): array
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-FREE-01', 'name' => 'PT Free Product', 'city' => 'Surabaya',
            'salesperson_id' => $user->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
        $product = Product::create([
            'part_num' => 'FRP-1000', 'description' => 'Saus Sambal 1kg', 'uom' => 'PCS',
            'price' => 10000, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);

        return [$customer, $product];
    }

    private function postOrder(Customer $c, array $lines)
    {
        return $this->postJson('/api/v1/orders', ['customer_id' => $c->id, 'lines' => $lines]);
    }

    public function test_free_product_line_without_a_paid_sibling_is_rejected(): void
    {
        [$c, $p] = $this->fixtures();

        $r = $this->postOrder($c, [
            ['product_id' => $p->id, 'qty' => 2, 'is_free_product' => true],
        ]);

        $r->assertStatus(422);
        $this->assertSame(0, SalesOrder::count());
    }

    public function test_free_product_on_npd_line_is_rejected(): void
    {
        [$c] = $this->fixtures();

        $r = $this->postOrder($c, [
            ['is_custom' => true, 'custom_part_name' => 'Produk Baru', 'qty' => 1, 'unit_price' => 5000, 'is_free_product' => true],
        ]);

        $r->assertStatus(422);
    }

    public function test_valid_free_product_line_zeroes_out_and_records_freeprod_charge(): void
    {
        [$c, $p] = $this->fixtures();

        $r = $this->postOrder($c, [
            ['product_id' => $p->id, 'qty' => 10], // baris berbayar
            ['product_id' => $p->id, 'qty' => 2, 'is_free_product' => true], // baris gratis, part sama
        ])->assertCreated();

        $order = SalesOrder::with('lines')->findOrFail($r->json('data.id'));

        $paidLine = $order->lines->firstWhere('is_free_product', false);
        $freeLine = $order->lines->firstWhere('is_free_product', true);

        $this->assertNotNull($freeLine);
        $this->assertSame('FREEPROD', $freeLine->misc_charge_code);
        $this->assertEquals(-20000.0, (float) $freeLine->misc_charge_amount); // 2 x 10000
        $this->assertEquals(0.0, (float) $freeLine->line_total);

        $this->assertEquals(100000.0, (float) $paidLine->line_total); // 10 x 10000, tidak terpengaruh
        $this->assertEquals(100000.0, (float) $order->subtotal); // baris gratis tidak menambah subtotal
        $this->assertEquals(100000.0, (float) $order->total);
    }

    public function test_client_supplied_unit_price_on_free_line_is_ignored(): void
    {
        [$c, $p] = $this->fixtures();

        $this->postOrder($c, [
            ['product_id' => $p->id, 'qty' => 5],
            ['product_id' => $p->id, 'qty' => 1, 'unit_price' => 1, 'is_free_product' => true],
        ])->assertCreated();

        $order = SalesOrder::with('lines')->first();
        $freeLine = $order->lines->firstWhere('is_free_product', true);

        // harga tetap ikut master (10000), bukan 1 yang dikirim klien
        $this->assertEquals(10000.0, (float) $freeLine->unit_price);
        $this->assertEquals(-10000.0, (float) $freeLine->misc_charge_amount);
    }
}