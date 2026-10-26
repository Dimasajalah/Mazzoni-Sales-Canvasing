<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\StarOutlet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.3 / MKT03: Star Outlet Request (Marketing mencentang Star Outlet Aktif). */
class StarOutletTest extends TestCase
{
    use RefreshDatabase;

    private function as(string $role): User
    {
        $u = User::factory()->create(['role' => $role, 'active' => true]);
        Sanctum::actingAs($u);

        return $u;
    }

    private function customer(string $code, bool $active = true): Customer
    {
        return Customer::create(['customer_code' => $code, 'name' => "Toko {$code}", 'city' => 'Bandung', 'active' => $active]);
    }

    public function test_a_manager_activates_a_star_outlet_and_who_and_when_are_recorded(): void
    {
        $u = $this->as('supervisor');
        $c = $this->customer('C1');

        $r = $this->postJson('/api/v1/marketing/star-outlets', [
            'customer_id' => $c->id, 'requested_by' => 'PT Distributor Jaya', 'request_reference' => 'SO-REQ/01',
        ])->assertStatus(201);

        $this->assertTrue($r->json('data.active'));
        $this->assertSame('Toko C1', $r->json('data.customer.name'));
        $this->assertSame('PT Distributor Jaya', $r->json('data.requested_by'));
        $this->assertSame($u->id, $r->json('data.activated_by'));
        $this->assertNotNull($r->json('data.activated_at'));
    }

    public function test_an_outlet_that_is_already_active_cannot_be_activated_twice(): void
    {
        $this->as('admin');
        $c = $this->customer('C1');
        $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $c->id])->assertStatus(201);

        $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $c->id])->assertStatus(422);
        $this->assertSame(1, StarOutlet::count());
    }

    public function test_an_inactive_customer_cannot_become_a_star_outlet(): void
    {
        $this->as('admin');
        $c = $this->customer('OFF', false);

        $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $c->id])->assertStatus(422);
        $this->assertSame(0, StarOutlet::count());
    }

    public function test_an_unknown_customer_is_rejected(): void
    {
        $this->as('admin');

        $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => 999])->assertStatus(422);
    }

    public function test_deactivating_and_reactivating_reuses_the_same_row(): void
    {
        $this->as('admin');
        $c = $this->customer('C1');
        $id = $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $c->id])->json('data.id');

        $off = $this->patchJson("/api/v1/marketing/star-outlets/{$id}", ['active' => false])->assertOk();
        $this->assertFalse($off->json('data.active'));
        $this->assertNotNull($off->json('data.deactivated_at'));

        $on = $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $c->id, 'requested_by' => 'Distributor Baru'])->assertStatus(201);
        $this->assertSame($id, $on->json('data.id'));
        $this->assertTrue($on->json('data.active'));
        $this->assertNull($on->json('data.deactivated_at'));
        $this->assertSame('Distributor Baru', $on->json('data.requested_by'));
        $this->assertSame(1, StarOutlet::count());
    }

    public function test_the_active_flag_can_be_switched_back_on_with_patch(): void
    {
        $this->as('admin');
        $c = $this->customer('C1');
        $id = $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $c->id])->json('data.id');
        $this->patchJson("/api/v1/marketing/star-outlets/{$id}", ['active' => false]);

        $r = $this->patchJson("/api/v1/marketing/star-outlets/{$id}", ['active' => true])->assertOk();

        $this->assertTrue($r->json('data.active'));
        $this->assertNull($r->json('data.deactivated_at'));
    }

    public function test_the_list_can_be_filtered_by_status_and_searched(): void
    {
        $this->as('admin');
        $a = $this->customer('AAA');
        $b = $this->customer('BBB');
        $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $a->id]);
        $idB = $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $b->id])->json('data.id');
        $this->patchJson("/api/v1/marketing/star-outlets/{$idB}", ['active' => false]);

        $active = $this->getJson('/api/v1/marketing/star-outlets?active=1')->assertOk();
        $this->assertSame(['AAA'], array_column(array_column($active->json('data'), 'customer'), 'customer_code'));

        $inactive = $this->getJson('/api/v1/marketing/star-outlets?active=0')->assertOk();
        $this->assertSame(['BBB'], array_column(array_column($inactive->json('data'), 'customer'), 'customer_code'));

        $search = $this->getJson('/api/v1/marketing/star-outlets?q=BBB')->assertOk();
        $this->assertCount(1, $search->json('data'));
    }

    public function test_candidates_show_each_outlets_star_status(): void
    {
        $this->as('admin');
        $a = $this->customer('STAR-A');
        $this->customer('STAR-B');
        $this->customer('OTHER');
        $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $a->id]);

        $r = $this->getJson('/api/v1/marketing/star-outlet-candidates?q=STAR')->assertOk();

        $byCode = collect($r->json('data'))->pluck('star_status', 'customer_code')->all();
        $this->assertSame(['STAR-A' => 'ACTIVE', 'STAR-B' => null], $byCode);
    }

    public function test_changes_are_written_to_the_audit_log(): void
    {
        $this->as('admin');
        $c = $this->customer('C1');
        $id = $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $c->id])->json('data.id');
        $this->patchJson("/api/v1/marketing/star-outlets/{$id}", ['active' => false]);

        $this->assertTrue(AuditLog::where('action', 'star_outlet.activate')->where('entity_id', $id)->exists());
        $this->assertTrue(AuditLog::where('action', 'star_outlet.deactivate')->where('entity_id', $id)->exists());
    }

    public function test_sales_cannot_use_star_outlet_endpoints(): void
    {
        $this->as('sales');
        $c = $this->customer('C1');

        $this->getJson('/api/v1/marketing/star-outlets')->assertStatus(403);
        $this->getJson('/api/v1/marketing/star-outlet-candidates')->assertStatus(403);
        $this->postJson('/api/v1/marketing/star-outlets', ['customer_id' => $c->id])->assertStatus(403);
        $this->assertSame(0, StarOutlet::count());
    }

    public function test_the_endpoints_require_login_and_unknown_ids_return_404(): void
    {
        $this->getJson('/api/v1/marketing/star-outlets')->assertStatus(401);

        $this->as('admin');
        $this->patchJson('/api/v1/marketing/star-outlets/999', ['active' => false])->assertStatus(404);
    }
}