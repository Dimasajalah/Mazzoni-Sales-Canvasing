<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Poin 14 (hasil meeting Okt 2026): pilihan termin pembayaran 15D/30D/45D di Quotation. */
class QuotePaymentTermTest extends TestCase
{
    use RefreshDatabase;

    private function loginAs(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function product(): Product
    {
        return Product::create([
            'part_num' => 'P-'.uniqid(), 'description' => 'Saus Tomat 1kg', 'uom' => 'PCS',
            'price' => 28500, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    public function test_accepts_valid_payment_term_on_create(): void
    {
        $this->loginAs();
        $p = $this->product();

        $res = $this->postJson('/api/v1/quotes', [
            'payment_term' => '30D',
            'lines' => [['product_id' => $p->id, 'qty_kg' => 10, 'gramasi_gr' => 500]],
        ])->assertCreated();

        $res->assertJsonPath('data.payment_term', '30D');
    }

    public function test_rejects_invalid_payment_term(): void
    {
        $this->loginAs();
        $p = $this->product();

        $this->postJson('/api/v1/quotes', [
            'payment_term' => '60D',
            'lines' => [['product_id' => $p->id, 'qty_kg' => 10]],
        ])->assertStatus(422)->assertJsonValidationErrors('payment_term');
    }

    public function test_payment_term_is_optional(): void
    {
        $this->loginAs();
        $p = $this->product();

        $res = $this->postJson('/api/v1/quotes', [
            'lines' => [['product_id' => $p->id, 'qty_kg' => 10, 'gramasi_gr' => 500]],
        ])->assertCreated();

        $res->assertJsonPath('data.payment_term', null);
    }

    public function test_payment_term_can_be_updated(): void
    {
        $this->loginAs();
        $p = $this->product();

        $quoteId = $this->postJson('/api/v1/quotes', [
            'payment_term' => '15D',
            'lines' => [['product_id' => $p->id, 'qty_kg' => 10, 'gramasi_gr' => 500]],
        ])->json('data.id');

        $this->patchJson("/api/v1/quotes/{$quoteId}", ['payment_term' => '45D'])
            ->assertOk()->assertJsonPath('data.payment_term', '45D');
    }
}