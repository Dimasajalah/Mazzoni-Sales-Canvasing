<?php
//backend/tests/Feature/OrderPricingTest.php
namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Blueprint 5.2.10: harga dan diskon ditentukan server, bukan klien. Juga tahap Payment pada tracker order.
 */
class OrderPricingTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: Customer, 1: Product} */
    private function fixtures(): array
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-PRC-01', 'name' => 'PT Harga', 'city' => 'Surabaya',
            'salesperson_id' => $user->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
        $product = Product::create([
            'part_num' => 'STM-1000', 'description' => 'Saus Tomat 1kg', 'uom' => 'PCS',
            'price' => 28500, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);

        return [$customer, $product];
    }

    private function postOrder(Customer $c, array $lines, array $header = [])
    {
        return $this->postJson('/api/v1/orders', ['customer_id' => $c->id, 'lines' => $lines] + $header);
    }

    public function test_a_unit_price_sent_by_the_client_is_ignored_for_catalog_products(): void
    {
        [$c, $p] = $this->fixtures();

        $r = $this->postOrder($c, [['product_id' => $p->id, 'qty' => 2, 'unit_price' => 1]])->assertCreated();

        $this->assertEquals(28500.0, (float) $r->json('data.lines.0.unit_price'));
        $this->assertEquals(57000.0, (float) $r->json('data.total'));
    }

    public function test_a_zero_unit_price_does_not_make_a_free_order(): void
    {
        [$c, $p] = $this->fixtures();

        $r = $this->postOrder($c, [['product_id' => $p->id, 'qty' => 2, 'unit_price' => 0]])->assertCreated();

        $this->assertEquals(57000.0, (float) $r->json('data.total'));
    }

    public function test_line_and_header_discounts_from_the_client_are_ignored(): void
    {
        [$c, $p] = $this->fixtures();

        $r = $this->postOrder($c, [['product_id' => $p->id, 'qty' => 2, 'discount' => 999999]], ['discount' => 999999])->assertCreated();

        $this->assertEquals(57000.0, (float) $r->json('data.total'));
        $this->assertEquals(0.0, (float) $r->json('data.discount'));
        $this->assertEquals(0.0, (float) $r->json('data.lines.0.discount'));
    }

    public function test_the_price_follows_the_current_master_price(): void
    {
        [$c, $p] = $this->fixtures();
        $p->update(['price' => 30000]);

        $r = $this->postOrder($c, [['product_id' => $p->id, 'qty' => 1, 'unit_price' => 28500]])->assertCreated();

        $this->assertEquals(30000.0, (float) $r->json('data.total'));
    }

    public function test_a_new_product_line_keeps_the_price_entered_by_sales_but_its_discount_is_ignored(): void
    {
        [$c] = $this->fixtures();

        $r = $this->postOrder($c, [[
            'is_custom' => true, 'custom_part_name' => 'Produk Baru', 'qty' => 3, 'unit_price' => 5000, 'discount' => 100000,
        ]])->assertCreated();

        $this->assertEquals(5000.0, (float) $r->json('data.lines.0.unit_price'));
        $this->assertEquals(15000.0, (float) $r->json('data.total'));
    }

    public function test_an_order_without_an_invoice_does_not_show_the_payment_step_as_paid(): void
    {
        [$c, $p] = $this->fixtures();
        $id = $this->postOrder($c, [['product_id' => $p->id, 'qty' => 1]])->assertCreated()->json('data.id');

        $timeline = collect($this->getJson("/api/v1/orders/{$id}/tracker")->assertOk()->json('data.timeline'));

        $this->assertNotNull($timeline->firstWhere('step', 'ORDER')['status']);
        $this->assertNull($timeline->firstWhere('step', 'INVOICE')['status']);
        $this->assertNull($timeline->firstWhere('step', 'PAYMENT')['status']); // sebelumnya salah: PAID
    }
}