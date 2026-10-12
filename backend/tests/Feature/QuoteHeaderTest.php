<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\Quote;
use App\Models\TaskSet;
use App\Models\User;
use App\Services\QuoteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Header Quotation (dokumen hal. 32): TOP termasuk COD, Quoted otomatis dari Win, dan PDF. */
class QuoteHeaderTest extends TestCase
{
    use RefreshDatabase;

    private function draftFor(User $user): Quote
    {
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = Lead::create([
            'business_name' => 'UD Header', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);

        return app(QuoteService::class)->create(['lead_id' => $lead->id], [], $user);
    }

    public function test_header_accepts_cod_and_the_new_header_fields(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $quote = $this->draftFor($user);

        $this->postJson("/api/v1/quotes/{$quote->id}/header", [
            'customer_po' => 'PO-77',
            'payment_term' => 'COD',
            'due_date' => '2026-10-20',
            'expected_close_date' => '2026-11-01',
            'notes' => 'Terima kasih atas minatnya',
        ])->assertOk();

        $this->assertDatabaseHas('quotes', [
            'id' => $quote->id, 'customer_po' => 'PO-77', 'payment_term' => 'COD',
            'notes' => 'Terima kasih atas minatnya',
        ]);

        $this->postJson("/api/v1/quotes/{$quote->id}/header", ['payment_term' => '60D'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('payment_term');
    }

    public function test_quoted_ticks_automatically_when_the_lead_is_won_and_dates_are_filled(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        $quote = $this->draftFor($user);
        $this->assertFalse((bool) $quote->fresh()->quoted);

        app(QuoteService::class)->syncFromLead($quote->lead, 'WIN');

        $fresh = $quote->fresh();
        $this->assertTrue((bool) $fresh->quoted);
        $this->assertSame(Quote::WON, $fresh->status);
        $this->assertNotNull($fresh->quoted_at);
        $this->assertSame(now()->addDays(14)->toDateString(), $fresh->expires_at->toDateString());
    }

    public function test_lost_lead_closes_the_quote_without_ticking_quoted(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        $quote = $this->draftFor($user);

        app(QuoteService::class)->syncFromLead($quote->lead, 'LOSE');

        $this->assertSame(Quote::LOST, $quote->fresh()->status);
        $this->assertFalse((bool) $quote->fresh()->quoted);
    }

    public function test_quotation_can_be_downloaded_as_a_pdf(): void
    {
        if (! class_exists(\Barryvdh\DomPDF\Facade\Pdf::class)) {
            $this->markTestSkipped('barryvdh/laravel-dompdf belum terpasang (composer require barryvdh/laravel-dompdf).');
        }

        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $quote = $this->draftFor($user);

        $response = $this->getJson("/api/v1/quotes/{$quote->id}/pdf")->assertOk();

        $this->assertStringStartsWith('Quotation-QUO-', $response->json('data.filename'));
        $this->assertStringStartsWith('%PDF', base64_decode($response->json('data.base64')));
    }
}