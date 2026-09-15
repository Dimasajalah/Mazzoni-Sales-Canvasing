<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PaymentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_payment_updates_invoice_balance(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-PAY-01',
            'name' => 'PT Bayar',
            'city' => 'Surabaya',
            'salesperson_id' => $user->id,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);

        $invoice = Invoice::create([
            'invoice_number' => 'INV-TEST-001',
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(30)->toDateString(),
            'invoice_amount' => 1000000,
            'paid_amount' => 0,
            'balance' => 1000000,
            'status' => 'OPEN',
            'sync_status' => 'NOT_REQUIRED',
        ]);

        $response = $this->postJson('/api/v1/payments', [
            'invoice_id' => $invoice->id,
            'customer_id' => $customer->id,
            'amount' => 400000,
            'method' => 'Transfer Bank',
            'reference' => 'TRX-1',
            'payment_date' => now()->toDateString(),
        ]);

        $response->assertCreated()->assertJsonPath('success', true);

        $invoice->refresh();
        $this->assertEquals(400000.0, (float) $invoice->paid_amount);
        $this->assertEquals(600000.0, (float) $invoice->balance);
        $this->assertEquals('PARTIAL', $invoice->status);
    }

    public function test_payment_rejects_amount_over_balance(): void
    {
        $user = User::factory()->create(['role' => 'finance', 'active' => true]);
        Sanctum::actingAs($user);

        $customer = Customer::create([
            'customer_code' => 'C-PAY-02',
            'name' => 'PT Overpay',
            'city' => 'Surabaya',
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);

        $invoice = Invoice::create([
            'invoice_number' => 'INV-TEST-002',
            'customer_id' => $customer->id,
            'invoice_date' => now()->toDateString(),
            'due_date' => now()->addDays(30)->toDateString(),
            'invoice_amount' => 100000,
            'paid_amount' => 0,
            'balance' => 100000,
            'status' => 'OPEN',
            'sync_status' => 'NOT_REQUIRED',
        ]);

        $response = $this->postJson('/api/v1/payments', [
            'invoice_id' => $invoice->id,
            'amount' => 150000,
            'method' => 'Tunai',
        ]);

        $response->assertStatus(422)->assertJsonPath('success', false);
    }
}
