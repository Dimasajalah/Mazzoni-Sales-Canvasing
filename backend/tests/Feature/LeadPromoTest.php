<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadPromo;
use App\Models\TaskSet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Promo (Customer-facing) (dokumen hal. 36): Apply dan lepas promo untuk sebuah prospek. */
class LeadPromoTest extends TestCase
{
    use RefreshDatabase;

    private function leadFor(User $user): Lead
    {
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();

        return Lead::create([
            'business_name' => 'UD Promo', 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);
    }

    public function test_a_promo_can_be_applied_once_listed_and_removed(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $lead = $this->leadFor($user);

        $this->postJson("/api/v1/leads/{$lead->id}/promos", ['promo_ref' => 'MZN10FREE1', 'promo_name' => 'Buy 10 ctn, get 1 FREE'])
            ->assertStatus(201);
        $this->postJson("/api/v1/leads/{$lead->id}/promos", ['promo_ref' => 'MZN10FREE1', 'promo_name' => 'Buy 10 ctn, get 1 FREE'])
            ->assertStatus(201);
        $this->assertSame(1, LeadPromo::where('lead_id', $lead->id)->count()); // Apply ulang tidak menggandakan

        $r = $this->getJson("/api/v1/leads/{$lead->id}/promos")->assertOk();
        $this->assertSame(['MZN10FREE1'], collect($r->json('data'))->pluck('promo_ref')->all());

        $this->postJson("/api/v1/leads/{$lead->id}/promos/remove", ['promo_ref' => 'MZN10FREE1'])->assertOk();
        $this->assertSame(0, LeadPromo::where('lead_id', $lead->id)->count());
    }

    public function test_promo_ref_is_required(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $lead = $this->leadFor($user);

        $this->postJson("/api/v1/leads/{$lead->id}/promos", [])->assertStatus(422)->assertJsonValidationErrors('promo_ref');
    }

    public function test_another_salesperson_cannot_touch_the_promos_of_a_lead_that_is_not_theirs(): void
    {
        $owner = User::factory()->create(['role' => 'sales', 'active' => true]);
        $lead = $this->leadFor($owner);
        Sanctum::actingAs($owner);
        $this->postJson("/api/v1/leads/{$lead->id}/promos", ['promo_ref' => 'WELCOME5'])->assertStatus(201);

        $other = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($other);

        $this->getJson("/api/v1/leads/{$lead->id}/promos")->assertStatus(403);
        $this->postJson("/api/v1/leads/{$lead->id}/promos", ['promo_ref' => 'POSMFREE'])->assertStatus(403);
        $this->postJson("/api/v1/leads/{$lead->id}/promos/remove", ['promo_ref' => 'WELCOME5'])->assertStatus(403);
        $this->assertSame(1, LeadPromo::where('lead_id', $lead->id)->count());
    }

    public function test_unknown_lead_is_not_found(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/leads/999999/promos')->assertStatus(404);
    }
}