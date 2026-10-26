<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingEvent;
use App\Models\MarketingMoveRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Blueprint MJU 3.2.16 / MKT15: Move Inventory Request Sample Internal.
 * Alurnya sama dengan MKT14 (display event) tanpa event, dan langkah 05 mencatat nama sales beserta peruntukannya.
 */
class MarketingSampleRequestTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(string $role, array $attrs = []): User
    {
        $u = $this->makeUser($role, $attrs);
        Sanctum::actingAs($u);

        return $u;
    }

    private function parts(): void
    {
        $columns = array_flip(Schema::getColumnListing('products'));
        foreach (['P-001', 'P-002'] as $part) {
            if (DB::table('products')->where('part_num', $part)->exists()) {
                continue;
            }
            DB::table('products')->insert(array_intersect_key([
                'part_num' => $part, 'epicor_part_num' => $part, 'description' => "Produk {$part}", 'name' => "Produk {$part}",
                'uom' => 'DUS', 'price' => 1000, 'created_at' => now(), 'updated_at' => now(),
            ], $columns));
        }
    }

    /** Event yang sudah disetujui, hanya dipakai untuk membuktikan bahwa display event dan sample internal tidak tercampur. */
    private function makeEvent(): MarketingEvent
    {
        $this->actAs('supervisor');
        Customer::firstOrCreate(['customer_code' => 'C1'], ['name' => 'Toko C1', 'active' => true]);
        $budget = MarketingBudget::first() ?? MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 100000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        $id = $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => $budget->id, 'description' => 'Bazaar Ramadan', 'reference_letter_no' => 'SK/'.uniqid(),
            'activity_type' => 'EVENT', 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201)->json('data.id');
        MarketingEvent::whereKey($id)->update(['status' => 'APPROVED']);

        return MarketingEvent::find($id);
    }

    private function url(string $path = ''): string
    {
        return '/api/v1/marketing/sample-requests'.($path ? "/{$path}" : '');
    }

    private function payload(array $over = []): array
    {
        $this->parts();

        return $over + [
            'notes' => 'Sample produk baru untuk tim sales',
            'items' => [['part_num' => 'P-001', 'qty' => 6, 'description' => 'Sample saus 250 ml'], ['part_num' => 'P-002', 'qty' => 3]],
        ];
    }

    private function createSample(array $over = []): int
    {
        return $this->postJson($this->url(), $this->payload($over))->assertStatus(201)->json('data.id');
    }

    private function onhandAll(int $id)
    {
        $items = MarketingMoveRequest::find($id)->items;

        return $this->postJson($this->url("{$id}/onhand"), ['onhand' => $items->map(fn ($i) => ['item_id' => $i->id, 'onhand_qty' => 4])->all()]);
    }

    private function recordMove(int $id, ?string $no = null)
    {
        return $this->postJson($this->url("{$id}/move-request"), ['epicor_request_no' => $no ?? 'MIR-S'.$id]);
    }

    private function recordTransferStep(int $id, ?string $praSj = null)
    {
        return $this->postJson($this->url("{$id}/transfer"), ['pra_sj_number' => $praSj ?? 'PSJ-S'.$id]);
    }

    private function recordIssueStep(int $id)
    {
        return $this->postJson($this->url("{$id}/issue"), ['issue_reference' => 'ISS-S'.$id]);
    }

    private function finish(int $id, array $over = [])
    {
        return $this->postJson($this->url("{$id}/complete"), $over + ['recipient_name' => 'Sales Budi', 'purpose' => 'Dibagikan ke calon pelanggan']);
    }

    /** Memajukan permintaan sampai tahap tertentu: checked, requested, transferred, issued. */
    private function advance(int $id, string $to): void
    {
        $this->actAs('supervisor');
        $this->onhandAll($id)->assertOk();
        if ($to === 'checked') {
            return;
        }
        $this->recordMove($id)->assertOk();
        if ($to === 'requested') {
            return;
        }
        $this->actAs('warehouse');
        $this->recordTransferStep($id)->assertOk();
        if ($to === 'transferred') {
            return;
        }
        $this->actAs('supervisor');
        $this->recordIssueStep($id)->assertOk();
    }

    public function test_marketing_creates_a_sample_request_without_an_event(): void
    {
        $this->actAs('supervisor', ['name' => 'Bu Marketing']);

        $r = $this->postJson($this->url(), $this->payload())->assertStatus(201);

        $this->assertSame('SM-'.now()->format('Y').'-00001', $r->json('data.req_no'));
        $this->assertSame('NEW', $r->json('data.status'));
        $this->assertNull($r->json('data.event'));
        $this->assertNull($r->json('data.marketing_event_id'));
        $this->assertSame('Bu Marketing', $r->json('data.creator.name'));
        $this->assertSame(['P-001', 'P-002'], array_column($r->json('data.items'), 'part_num'));
        $this->assertEquals([6, 3], array_column($r->json('data.items'), 'qty'));
        $this->assertTrue($r->json('data.flags.can_edit'));
        $this->assertTrue($r->json('data.flags.can_check'));
        $this->assertSame('SM-'.now()->format('Y').'-00002', $this->postJson($this->url(), $this->payload())->json('data.req_no'));
    }

    public function test_an_event_sent_by_mistake_is_ignored_for_samples(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');

        $r = $this->postJson($this->url(), $this->payload(['event_id' => $event->id]))->assertStatus(201);

        $this->assertNull($r->json('data.marketing_event_id'));
        $this->assertNull($r->json('data.event'));
    }

    public function test_the_items_are_validated_against_the_part_master(): void
    {
        $this->actAs('supervisor');

        $this->postJson($this->url(), $this->payload(['items' => []]))->assertStatus(422);
        $this->postJson($this->url(), $this->payload(['items' => [['part_num' => 'P-001', 'qty' => 0]]]))->assertStatus(422);
        $this->postJson($this->url(), $this->payload(['items' => [['part_num' => 'P-001', 'qty' => 1], ['part_num' => 'p-001', 'qty' => 2]]]))->assertStatus(422); // kode ganda
        $unknown = $this->postJson($this->url(), $this->payload(['items' => [['part_num' => 'TIDAK-ADA', 'qty' => 1]]]))->assertStatus(422);
        $this->assertStringContainsString('tidak ada di Part Master', $unknown->json('message'));
        $this->assertSame(0, MarketingMoveRequest::count());
    }

    public function test_the_request_can_be_changed_only_before_the_on_hand_check(): void
    {
        $this->actAs('supervisor');
        $id = $this->createSample();

        $r = $this->putJson($this->url((string) $id), $this->payload(['items' => [['part_num' => 'P-002', 'qty' => 9]]]))->assertOk();
        $this->assertSame(['P-002'], array_column($r->json('data.items'), 'part_num'));
        $this->assertNull($r->json('data.marketing_event_id'));

        $this->onhandAll($id)->assertOk();
        $this->putJson($this->url((string) $id), $this->payload())->assertStatus(422);
    }

    public function test_the_whole_flow_ends_with_the_sales_name_and_purpose_in_the_remarks(): void
    {
        $this->actAs('supervisor');
        $id = $this->createSample();
        $this->advance($id, 'issued');
        $this->actAs('supervisor');

        $waiting = $this->getJson($this->url((string) $id))->assertOk();
        $this->assertSame('ISSUED', $waiting->json('data.status'));
        $this->assertStringContainsString('nama sales dan peruntukannya', $waiting->json('data.awaiting_label'));
        $this->assertTrue($waiting->json('data.flags.can_complete'));

        $r = $this->finish($id, ['recipient_name' => ' Sales Budi ', 'purpose' => ' Dibagikan ke calon pelanggan '])->assertOk();

        $this->assertSame('DONE', $r->json('data.status'));
        $this->assertSame('Sales Budi', $r->json('data.recipient_name'));
        $this->assertSame('Dibagikan ke calon pelanggan', $r->json('data.purpose'));
        $this->assertSame('Sales Budi / Dibagikan ke calon pelanggan', $r->json('data.remarks')); // nama sales dan peruntukannya pada Remarks
        $this->assertSame('MIR-S'.$id, $r->json('data.epicor_request_no'));
        $this->assertSame('PSJ-S'.$id, $r->json('data.pra_sj_number'));
        $this->assertSame('ISS-S'.$id, $r->json('data.issue_reference'));
        $this->assertNull($r->json('data.awaiting_label'));
        $this->finish($id)->assertStatus(422); // tidak bisa dua kali
    }

    public function test_both_the_sales_name_and_the_purpose_are_required_at_the_last_step(): void
    {
        $this->actAs('supervisor');
        $id = $this->createSample();
        $this->advance($id, 'issued');
        $this->actAs('supervisor');

        $this->postJson($this->url("{$id}/complete"), [])->assertStatus(422);
        $this->postJson($this->url("{$id}/complete"), ['recipient_name' => 'Sales Budi'])->assertStatus(422);           // peruntukan kosong
        $this->postJson($this->url("{$id}/complete"), ['purpose' => 'Dibagikan ke calon pelanggan'])->assertStatus(422); // nama sales kosong
        $this->postJson($this->url("{$id}/complete"), ['recipient_name' => 'Sales Budi', 'purpose' => '   '])->assertStatus(422);
        $this->assertSame('ISSUED', MarketingMoveRequest::find($id)->status);
    }

    public function test_only_warehouse_runs_the_inventory_transfer_and_the_steps_follow_the_order(): void
    {
        $this->actAs('supervisor');
        $id = $this->createSample();

        $this->recordMove($id)->assertStatus(422);  // On-Hand belum diperiksa
        $this->recordIssueStep($id)->assertStatus(422);
        $this->finish($id)->assertStatus(422);

        $this->advance($id, 'requested');
        $this->actAs('supervisor');
        $this->recordTransferStep($id, 'PSJ-X')->assertStatus(403); // Marketing bukan Warehouse

        $this->actAs('warehouse');
        $r = $this->recordTransferStep($id, 'PSJ-X')->assertOk();
        $this->assertSame('TRANSFERRED', $r->json('data.status'));
        $this->recordIssueStep($id)->assertStatus(403); // Warehouse bukan Marketing
    }

    public function test_warehouse_can_see_samples_but_cannot_create_or_change_them(): void
    {
        $this->actAs('supervisor');
        $id = $this->createSample();

        $this->actAs('warehouse');
        $this->getJson($this->url((string) $id))->assertOk();
        $this->postJson($this->url(), $this->payload())->assertStatus(403);
        $this->putJson($this->url((string) $id), $this->payload())->assertStatus(403);
        $this->onhandAll($id)->assertStatus(403);
    }

    public function test_samples_and_display_requests_do_not_mix(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $sample = $this->createSample();
        $display = $this->postJson('/api/v1/marketing/move-requests', $this->payload(['event_id' => $event->id]))->assertStatus(201)->json('data.id');

        $this->assertSame([$sample], array_column($this->getJson($this->url())->json('data'), 'id'));
        $this->assertSame([$display], array_column($this->getJson('/api/v1/marketing/move-requests')->json('data'), 'id'));

        $this->getJson($this->url((string) $display))->assertStatus(404);                       // permintaan display tidak terbuka dari alamat sample
        $this->getJson('/api/v1/marketing/move-requests/'.$sample)->assertStatus(404);           // dan sebaliknya
        $this->onhandAll($display)->assertStatus(404);

        $this->assertStringStartsWith('SM-', MarketingMoveRequest::find($sample)->req_no);
        $this->assertStringStartsWith('MV-', MarketingMoveRequest::find($display)->req_no);
    }

    public function test_document_numbers_stay_unique_across_both_kinds(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $sample = $this->createSample();
        $display = $this->postJson('/api/v1/marketing/move-requests', $this->payload(['event_id' => $event->id]))->assertStatus(201)->json('data.id');
        $this->onhandAll($sample)->assertOk();
        $items = MarketingMoveRequest::find($display)->items;
        $this->postJson('/api/v1/marketing/move-requests/'.$display.'/onhand', ['onhand' => $items->map(fn ($i) => ['item_id' => $i->id, 'onhand_qty' => 1])->all()])->assertOk();

        $this->recordMove($sample, 'MIR-SAMA')->assertOk();
        $this->postJson('/api/v1/marketing/move-requests/'.$display.'/move-request', ['epicor_request_no' => 'MIR-SAMA'])->assertStatus(422);
    }

    public function test_the_list_shows_who_has_to_act_next(): void
    {
        $this->actAs('supervisor');
        $new = $this->createSample();
        $requested = $this->createSample();
        $this->advance($requested, 'requested');

        $this->actAs('supervisor');
        $mine = $this->getJson($this->url())->assertOk();
        $this->assertSame([$requested, $new], array_column($mine->json('data'), 'id'));
        $this->assertSame([false, true], array_column($mine->json('data'), 'can_act'));
        $this->assertSame(2, $mine->json('data.0.items_count'));

        $this->actAs('warehouse');
        $this->assertSame([true, false], array_column($this->getJson($this->url())->json('data'), 'can_act'));
        $this->assertCount(1, $this->getJson($this->url().'?q='.MarketingMoveRequest::find($new)->req_no)->json('data'));
    }

    public function test_other_roles_cannot_use_sample_requests(): void
    {
        $this->actAs('supervisor');
        $id = $this->createSample();

        foreach (['sales', 'finance'] as $role) {
            $this->actAs($role);
            $this->getJson($this->url())->assertStatus(403);
            $this->getJson($this->url((string) $id))->assertStatus(403);
            $this->postJson($this->url(), $this->payload())->assertStatus(403);
            $this->finish($id)->assertStatus(403);
        }
        $this->assertSame(1, MarketingMoveRequest::count());
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        $this->actAs('supervisor');
        $id = $this->createSample();
        $this->advance($id, 'issued');
        $this->actAs('supervisor');
        $this->finish($id)->assertOk();

        foreach (['create', 'onhand', 'request', 'transfer', 'issue', 'complete'] as $step) {
            $this->assertTrue(AuditLog::where('action', "marketing_move_request.{$step}")->where('entity_id', $id)->exists(), $step);
        }
    }

    public function test_the_endpoints_require_login_and_unknown_requests_return_404(): void
    {
        $this->getJson($this->url())->assertStatus(401);
        $this->getJson($this->url('1'))->assertStatus(401);
        $this->postJson($this->url(), [])->assertStatus(401);
        $this->postJson($this->url('1/complete'), [])->assertStatus(401);

        $this->actAs('supervisor');
        $this->getJson($this->url('999'))->assertStatus(404);
        $this->recordMove(999)->assertStatus(404);
        $this->finish(999)->assertStatus(404);
    }
}