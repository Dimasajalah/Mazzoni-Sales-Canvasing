<?php

namespace Tests\Feature;

use App\Models\DiscountStratum;
use App\Models\Product;
use App\Models\QuoteLine;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 15 (hasil meeting Okt 2026): diskon per baris 4 kolom bertingkat (Disc 1-4).
 * Bertingkat = tiap kolom memotong SISA harga setelah kolom sebelumnya, bukan dijumlah.
 */
class CascadingDiscountTest extends TestCase
{
    use RefreshDatabase;

    private function loginAs(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function product(float $price = 100000): Product
    {
        return Product::create([
            'part_num' => 'P-'.uniqid(), 'description' => 'Produk Uji', 'uom' => 'PCS',
            'price' => $price, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_cascade_percent_matches_manual_calculation_not_additive(): void
    {
        // 10% lalu 5% lalu 2% -> 1 - (0,90 x 0,95 x 0,98) = 16,21%, BUKAN 17% (dijumlah)
        $this->assertEqualsWithDelta(16.21, QuoteLine::cascadePercent([10, 5, 2]), 0.01);
        $this->assertSame(0.0, QuoteLine::cascadePercent([0, 0, 0, 0, 0]));
        $this->assertSame(100.0, QuoteLine::cascadePercent([100, 50]));
    }

    public function test_all_four_discount_columns_cascade_on_quote_line(): void
    {
        $this->loginAs();
        $p = $this->product(100000);

        $res = $this->postJson('/api/v1/quotes', [
            'lines' => [[
                'product_id' => $p->id, 'gramasi_gr' => 1000, 'qty_kg' => 1,
                'disc1_percent' => 10, 'disc2_percent' => 5, 'disc3_percent' => 5, 'disc4_percent' => 2,
            ]],
        ])->assertCreated();

        // gross = 1 pcs x 100.000 = 100.000
        // multiplier = 0,90 x 0,95 x 0,95 x 0,98 = 0,796005 -> total = 79.600,50
        $res->assertJsonPath('data.lines.0.disc1_percent', '10.00')
            ->assertJsonPath('data.lines.0.disc2_percent', '5.00')
            ->assertJsonPath('data.lines.0.disc3_percent', '5.00')
            ->assertJsonPath('data.lines.0.disc4_percent', '2.00')
            ->assertJsonPath('data.total', '79600.50');
    }

    public function test_strata_applies_before_disc1_to_disc4_in_the_chain(): void
    {
        $this->loginAs();
        $p = $this->product(10000);
        DiscountStratum::create(['min_kg' => 1, 'max_kg' => null, 'discount_percent' => 10]);

        $res = $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $p->id, 'gramasi_gr' => 1000, 'qty_kg' => 1, 'disc1_percent' => 10]],
        ])->assertCreated();

        // strata 10% lalu disc1 10% -> 1 - (0,90 x 0,90) = 19% (bukan 20%)
        $res->assertJsonPath('data.lines.0.strata_percent', '10.00')
            ->assertJsonPath('data.total', '8100.00'); // 10.000 x 0,81
    }

    public function test_each_discount_column_is_capped_at_100_percent(): void
    {
        $this->loginAs();
        $p = $this->product(1000);

        $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $p->id, 'gramasi_gr' => 1000, 'qty_kg' => 1, 'disc1_percent' => 150]],
        ])->assertStatus(422)->assertJsonValidationErrors('lines.0.disc1_percent');
    }
}