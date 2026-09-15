<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_order_generates_staging_number(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-ORD-01',
            'name' => 'PT Order',
            'city' => 'Surabaya',
            'salesperson_id' => $user->id,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);

        $product = Product::create([
            'part_num' => 'STM-1000',
            'description' => 'Saus Tomat 1kg',
            'uom' => 'PCS',
            'price' => 28500,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);

        $response = $this->postJson('/api/v1/orders', [
            'customer_id' => $customer->id,
            'customer_po' => 'PO-99',
            'lines' => [
                ['product_id' => $product->id, 'qty' => 10],
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('success', true);

        $orderNumber = $response->json('data.order_number');
        $this->assertMatchesRegularExpression('/^SO-STG-\d{4}-\d{6}$/', $orderNumber);
        $this->assertEquals(285000.0, (float) $response->json('data.total'));
    }
}
