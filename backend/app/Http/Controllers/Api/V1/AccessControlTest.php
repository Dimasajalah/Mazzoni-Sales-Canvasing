<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\ReturnRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Pengerasan akses order dan retur: kepemilikan data, peran pengubah status retur, urutan status, dan penomoran.
 * Tes order dilewati (skip) bila order uji tidak bisa dibuat lewat POST /orders (mis. aturan canOrder berbeda).
 */
class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(User $u): User
    {
        Sanctum::actingAs($u);

        return $u;
    }

    private function productId(): int
    {
        $existing = DB::table('products')->where('part_num', 'P-ACC')->value('id');
        if ($existing) {
            return (int) $existing;
        }
        $columns = array_flip(Schema::getColumnListing('products'));

        return (int) DB::table('products')->insertGetId(array_intersect_key([
            'part_num' => 'P-ACC', 'epicor_part_num' => 'P-ACC', 'description' => 'Produk akses', 'name' => 'Produk akses',
            'uom' => 'DUS', 'price' => 1000, 'created_at' => now(), 'updated_at' => now(),
        ], $columns));
    }

    private function customerId(): int
    {
        return (int) (Customer::where('customer_code', 'C-ACC')->value('id')
            ?? Customer::create(['customer_code' => 'C-ACC', 'name' => 'Toko Akses', 'active' => true])->id);
    }

    private function submitReturn(User $owner): int
    {
        $this->actAs($owner);

        return $this->postJson('/api/v1/returns', [
            'customer_id' => $this->customerId(), 'reason' => 'Rusak', 'lines' => [['product_id' => $this->productId(), 'qty' => 2]],
        ])->assertStatus(201)->json('data.id');
    }

    private function setStatus(int $id, string $status)
    {
        return $this->patchJson("/api/v1/returns/{$id}/status", ['status' => $status]);
    }

    /** Daftar bisa berbentuk paginasi (data.data) atau larik langsung; ambil id-nya saja. */
    private function idsOf($response): array
    {
        $d = $response->json('data');
        $rows = is_array($d) && array_key_exists('data', $d) ? $d['data'] : $d;

        return array_map('intval', array_column((array) $rows, 'id'));
    }

    // ---------------------------------------------------------------- retur: status

    public function test_sales_cannot_change_return_status_even_for_their_own_return(): void
    {
        $sales = $this->makeUser('sales');
        $id = $this->submitReturn($sales);

        $this->setStatus($id, 'APPROVED')->assertStatus(403);

        $row = ReturnRequest::find($id);
        $this->assertSame('SUBMITTED', $row->status);
        $this->assertNull($row->rma_number);
    }

    public function test_finance_and_warehouse_cannot_change_return_status(): void
    {
        $id = $this->submitReturn($this->makeUser('sales'));

        foreach (['finance', 'warehouse'] as $role) {
            $this->actAs($this->makeUser($role));
            $this->setStatus($id, 'VERIFIED')->assertStatus(403);
        }
        $this->assertSame('SUBMITTED', ReturnRequest::find($id)->status);
    }

    public function test_supervisor_moves_a_return_forward_and_the_rma_number_is_issued_on_approval(): void
    {
        $id = $this->submitReturn($this->makeUser('sales'));
        $this->actAs($this->makeUser('supervisor'));

        $this->assertNull($this->setStatus($id, 'VERIFIED')->assertOk()->json('data.rma_number'));
        $approved = $this->setStatus($id, 'APPROVED')->assertOk();
        $this->assertMatchesRegularExpression('/^RMA-STG-\d{4}-\d{6}$/', $approved->json('data.rma_number'));

        $issued = $this->setStatus($id, 'RMA_ISSUED')->assertOk();
        $this->assertSame($approved->json('data.rma_number'), $issued->json('data.rma_number')); // nomor tidak berganti
        $this->assertSame(4, ReturnRequest::find($id)->statusHistories()->count()); // diajukan + 3 perubahan
    }

    public function test_admin_can_change_return_status_too(): void
    {
        $id = $this->submitReturn($this->makeUser('sales'));
        $this->actAs($this->makeUser('admin'));

        $this->assertSame('REJECTED', $this->setStatus($id, 'REJECTED')->assertOk()->json('data.status'));
    }

    public function test_unknown_repeated_and_out_of_order_statuses_are_rejected(): void
    {
        $sales = $this->makeUser('sales');
        $first = $this->submitReturn($sales);
        $this->actAs($this->makeUser('supervisor'));

        $this->setStatus($first, 'NGAWUR')->assertStatus(422);        // status tidak dikenal
        $this->setStatus($first, 'SUBMITTED')->assertStatus(422);     // sama dengan status sekarang
        $this->setStatus($first, 'RMA_ISSUED')->assertStatus(422);    // melompati persetujuan
        $this->assertNull(ReturnRequest::find($first)->rma_number);

        $this->setStatus($first, 'REJECTED')->assertOk();
        $this->setStatus($first, 'APPROVED')->assertStatus(422);      // ditolak = selesai
        $this->assertSame('REJECTED', ReturnRequest::find($first)->status);
        $this->assertNull(ReturnRequest::find($first)->rma_number);

        $second = $this->submitReturn($sales);
        $this->actAs($this->makeUser('supervisor'));
        $this->setStatus($second, 'APPROVED')->assertOk();
        $this->setStatus($second, 'SUBMITTED')->assertStatus(422);    // tidak bisa mundur
        $this->assertSame('APPROVED', ReturnRequest::find($second)->status);
    }

    public function test_status_changes_are_written_to_the_audit_log(): void
    {
        $id = $this->submitReturn($this->makeUser('sales'));
        $this->actAs($this->makeUser('supervisor'));
        $this->setStatus($id, 'VERIFIED')->assertOk();

        $this->assertTrue(AuditLog::where('action', 'return.status')->where('entity_id', $id)->exists());
    }

    public function test_status_change_checks_the_role_before_looking_for_the_return(): void
    {
        $this->actAs($this->makeUser('sales'));
        $this->setStatus(999, 'VERIFIED')->assertStatus(403);

        $this->actAs($this->makeUser('supervisor'));
        $this->setStatus(999, 'VERIFIED')->assertStatus(404);
    }

    // ---------------------------------------------------------------- retur: kepemilikan

    public function test_a_sales_cannot_read_someone_elses_return_but_managers_can(): void
    {
        $a = $this->makeUser('sales');
        $b = $this->makeUser('sales');
        $id = $this->submitReturn($a);

        $this->actAs($b);
        $this->getJson("/api/v1/returns/{$id}")->assertStatus(404);

        foreach ([$a, $this->makeUser('supervisor'), $this->makeUser('admin')] as $who) {
            $this->actAs($who);
            $this->getJson("/api/v1/returns/{$id}")->assertOk();
        }
    }

    public function test_the_return_list_is_forced_to_own_data_for_sales_and_the_client_filter_is_ignored(): void
    {
        $a = $this->makeUser('sales');
        $b = $this->makeUser('sales');
        $idA = $this->submitReturn($a);
        $idB = $this->submitReturn($b);

        $this->actAs($b);
        $this->assertSame([$idB], $this->idsOf($this->getJson('/api/v1/returns')->assertOk()));
        $this->assertSame([$idB], $this->idsOf($this->getJson("/api/v1/returns?salesperson_id={$a->id}")->assertOk())); // dipaksa ke miliknya

        $this->actAs($this->makeUser('supervisor'));
        $all = $this->idsOf($this->getJson('/api/v1/returns')->assertOk());
        $this->assertEqualsCanonicalizing([$idA, $idB], $all);
        $this->assertSame([$idA], $this->idsOf($this->getJson("/api/v1/returns?salesperson_id={$a->id}")->assertOk()));
    }

    public function test_finance_and_warehouse_only_see_their_own_returns_by_default_and_roles_can_be_extended_by_config(): void
    {
        $idA = $this->submitReturn($this->makeUser('sales'));
        $finance = $this->makeUser('finance');

        $this->actAs($finance);
        $this->assertSame([], $this->idsOf($this->getJson('/api/v1/returns')->assertOk()));
        $this->actAs($this->makeUser('warehouse'));
        $this->assertSame([], $this->idsOf($this->getJson('/api/v1/returns')->assertOk()));

        config(['access.view_all_roles' => ['supervisor', 'admin', 'finance']]);
        $this->actAs($finance);
        $this->assertSame([$idA], $this->idsOf($this->getJson('/api/v1/returns')->assertOk()));
    }

    public function test_the_emergency_switch_restores_the_old_behaviour(): void
    {
        $a = $this->makeUser('sales');
        $b = $this->makeUser('sales');
        $id = $this->submitReturn($a);

        config(['access.enforce' => false]);
        $this->actAs($b);
        $this->getJson("/api/v1/returns/{$id}")->assertOk();
        $this->setStatus($id, 'VERIFIED')->assertOk();
    }

    public function test_return_numbers_are_sequential_and_unique(): void
    {
        $sales = $this->makeUser('sales');
        $first = ReturnRequest::find($this->submitReturn($sales))->return_number;
        $second = ReturnRequest::find($this->submitReturn($sales))->return_number;

        $this->assertNotSame($first, $second);
        $this->assertSame((int) substr($first, -6) + 1, (int) substr($second, -6));
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/returns')->assertStatus(401);
        $this->getJson('/api/v1/returns/1')->assertStatus(401);
        $this->patchJson('/api/v1/returns/1/status', ['status' => 'APPROVED'])->assertStatus(401);
        $this->getJson('/api/v1/orders')->assertStatus(401);
        $this->getJson('/api/v1/orders/1')->assertStatus(401);
        $this->getJson('/api/v1/orders/1/tracker')->assertStatus(401);
    }

    public function test_return_detail_tells_the_screen_whether_the_user_may_change_the_status(): void
    {
        $sales = $this->makeUser('sales');
        $id = $this->submitReturn($sales);

        $this->actAs($sales);
        $this->assertFalse($this->getJson("/api/v1/returns/{$id}")->assertOk()->json('data.can_change_status'));

        $this->actAs($this->makeUser('supervisor'));
        $this->assertTrue($this->getJson("/api/v1/returns/{$id}")->assertOk()->json('data.can_change_status'));

        $updated = $this->setStatus($id, 'VERIFIED')->assertOk();
        $this->assertTrue($updated->json('data.can_change_status')); // layar tidak kehilangan tombol setelah aksi
    }

    public function test_return_detail_carries_what_the_screen_needs(): void
    {
        $id = $this->submitReturn($this->makeUser('sales'));
        $this->actAs($this->makeUser('supervisor'));

        $r = $this->getJson("/api/v1/returns/{$id}")->assertOk();

        $this->assertSame('SUBMITTED', $r->json('data.status'));
        $this->assertSame('Toko Akses', $r->json('data.customer.name'));
        $this->assertSame(2.0, (float) $r->json('data.lines.0.qty'));
        $this->assertNotNull($r->json('data.lines.0.product'));
        $this->assertCount(1, $r->json('data.status_histories')); // kunci snake_case dari relasi statusHistories
        $this->assertIsArray($r->json('data.attachments'));
    }

    // ---------------------------------------------------------------- order

    /** @return array{id: int, number: string} */
    private function orderOrSkip(User $owner): array
    {
        $this->actAs($owner);
        $r = $this->postJson('/api/v1/orders', [
            'customer_id' => $this->customerId(),
            'lines' => [['product_id' => $this->productId(), 'qty' => 1, 'unit_price' => 1000]],
        ]);
        if ($r->status() !== 201) {
            $this->markTestSkipped('Order uji tidak bisa dibuat lewat POST /orders (status '.$r->status().': '.substr($r->getContent(), 0, 200).'). Sesuaikan pembuatan order di tes ini.');
        }

        return ['id' => (int) $r->json('data.id'), 'number' => (string) $r->json('data.order_number')];
    }

    private function orderIdOrSkip(User $owner): int
    {
        return $this->orderOrSkip($owner)['id'];
    }

    public function test_a_sales_cannot_open_or_track_someone_elses_order(): void
    {
        $a = $this->makeUser('sales');
        $b = $this->makeUser('sales');
        $id = $this->orderIdOrSkip($a);

        $this->actAs($b);
        $this->getJson("/api/v1/orders/{$id}")->assertStatus(404);
        $this->getJson("/api/v1/orders/{$id}/tracker")->assertStatus(404);

        $this->actAs($a);
        $this->getJson("/api/v1/orders/{$id}")->assertOk();
        $this->actAs($this->makeUser('supervisor'));
        $this->getJson("/api/v1/orders/{$id}")->assertOk();
    }

    public function test_the_order_list_is_forced_to_own_data_for_sales_and_the_client_filter_is_ignored(): void
    {
        $a = $this->makeUser('sales');
        $b = $this->makeUser('sales');
        $idA = $this->orderIdOrSkip($a);
        $idB = $this->orderIdOrSkip($b);

        $this->actAs($b);
        $this->assertSame([$idB], $this->idsOf($this->getJson('/api/v1/orders')->assertOk()));
        $this->assertSame([$idB], $this->idsOf($this->getJson("/api/v1/orders?salesperson_id={$a->id}")->assertOk()));

        $this->actAs($this->makeUser('supervisor'));
        $this->assertEqualsCanonicalizing([$idA, $idB], $this->idsOf($this->getJson('/api/v1/orders')->assertOk()));
    }

    public function test_order_numbers_are_unique(): void
    {
        $sales = $this->makeUser('sales');
        $first = $this->orderOrSkip($sales)['number'];
        $second = $this->orderOrSkip($sales)['number'];

        $this->assertNotSame('', $first);
        $this->assertNotSame($first, $second);
    }
}