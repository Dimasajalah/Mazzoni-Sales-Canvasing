<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Bug ditemukan lewat tampilan Home: Ringkasan Aging selalu 0 karena Home.jsx membaca nama
 * field yang tidak sesuai dengan yang dikirim backend (CURRENT/1-30/31-60/60+, bukan
 * current/d1_30/d31_60/d60_plus). Tes ini memastikan bentuk data dari backend sudah benar,
 * termasuk customers_with_ar yang sebelumnya belum pernah dihitung sama sekali.
 */
class DashboardArSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function invoice(Customer $customer, string $code, float $amount, int $daysOverdue): Invoice
    {
        return Invoice::create([
            'invoice_number' => $code,
            'customer_id' => $customer->id,
            'invoice_date' => now()->subDays($daysOverdue + 30)->toDateString(),
            'due_date' => now()->subDays($daysOverdue)->toDateString(),
            'invoice_amount' => $amount,
            'paid_amount' => 0,
            'balance' => $amount,
            'status' => 'OPEN',
            'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_dashboard_ar_uses_bucket_keys_matching_frontend_and_counts_customers_with_ar(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $a = Customer::create(['customer_code' => 'C-AR-A', 'name' => 'PT A', 'salesperson_id' => $user->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED']);
        $b = Customer::create(['customer_code' => 'C-AR-B', 'name' => 'PT B', 'salesperson_id' => $user->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED']);
        $lunas = Customer::create(['customer_code' => 'C-AR-C', 'name' => 'PT Lunas', 'salesperson_id' => $user->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED']);

        $this->invoice($a, 'INV-AR-1', 100000, -5);   // belum jatuh tempo -> CURRENT
        $this->invoice($a, 'INV-AR-2', 50000, 20);     // -> 1-30
        $this->invoice($b, 'INV-AR-3', 75000, 45);     // -> 31-60
        $this->invoice($b, 'INV-AR-4', 25000, 90);     // -> 60+

        // Customer yang sudah lunas tidak ikut dihitung customers_with_ar
        Invoice::create([
            'invoice_number' => 'INV-AR-5', 'customer_id' => $lunas->id,
            'invoice_date' => now()->subDays(40)->toDateString(), 'due_date' => now()->subDays(10)->toDateString(),
            'invoice_amount' => 200000, 'paid_amount' => 200000, 'balance' => 0, 'status' => 'PAID', 'sync_status' => 'NOT_REQUIRED',
        ]);

        $ar = $this->getJson('/api/v1/dashboard')->assertOk()->json('data.ar');

        $this->assertSame(['CURRENT', '1-30', '31-60', '60+', 'total', 'overdue_count', 'customers_with_ar'], array_keys($ar));
        $this->assertEquals(100000, $ar['CURRENT']);
        $this->assertEquals(50000, $ar['1-30']);
        $this->assertEquals(75000, $ar['31-60']);
        $this->assertEquals(25000, $ar['60+']);
        $this->assertEquals(250000, $ar['total']);
        $this->assertSame(3, $ar['overdue_count']); // 3 invoice sudah lewat jatuh tempo (20/45/90 hari)
        $this->assertSame(2, $ar['customers_with_ar']); // A dan B, bukan yang sudah lunas
    }
}