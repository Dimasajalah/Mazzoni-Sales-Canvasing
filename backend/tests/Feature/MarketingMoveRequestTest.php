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
 * Blueprint MJU 3.2.15 / MKT14: Move Inventory Request Display Support Event.
 * Peran bawaan: Marketing = supervisor dan admin; Warehouse = warehouse dan admin.
 */
class MarketingMoveRequestTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

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

    /** Part Master: P-001 dan P-002 (kolom yang tidak ada di tabel products dilewati). */
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

    /** Event yang sudah disetujui (dibuat lewat API oleh supervisor, lalu statusnya disetujui). */
    private function makeEvent(string $name = 'Bazaar Ramadan', string $type = 'EVENT', string $status = 'APPROVED'): MarketingEvent
    {
        $this->seq++;
        $this->actAs('supervisor');
        Customer::firstOrCreate(['customer_code' => 'C1'], ['name' => 'Toko C1', 'active' => true]);
        $budget = MarketingBudget::first() ?? MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 100000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        $id = $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => $budget->id, 'description' => $name, 'reference_letter_no' => 'SK/'.$this->seq.'/'.uniqid(),
            'activity_type' => $type, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201)->json('data.id');
        MarketingEvent::whereKey($id)->update(['status' => $status]);

        return MarketingEvent::find($id);
    }

    private function url(string $path = ''): string
    {
        return '/api/v1/marketing/move-requests'.($path ? "/{$path}" : '');
    }

    private function payload(int $eventId, array $over = []): array
    {
        $this->parts();

        return $over + [
            'event_id' => $eventId, 'notes' => 'Display booth utama',
            'items' => [['part_num' => 'P-001', 'qty' => 10, 'description' => 'Standing banner'], ['part_num' => 'P-002', 'qty' => 2.5]],
        ];
    }

    private function createReq(int $eventId, array $over = []): int
    {
        return $this->postJson($this->url(), $this->payload($eventId, $over))->assertStatus(201)->json('data.id');
    }

    private function onhandAll(int $id, float $qty = 4)
    {
        $items = MarketingMoveRequest::find($id)->items;

        return $this->postJson($this->url("{$id}/onhand"), [
            'onhand' => $items->map(fn ($i) => ['item_id' => $i->id, 'onhand_qty' => $qty])->all(), 'notes' => 'Stok display menipis',
        ]);
    }

    private function recordMove(int $id, string $no = 'MIR-0001')
    {
        return $this->postJson($this->url("{$id}/move-request"), ['epicor_request_no' => $no]);
    }

    private function recordTransferStep(int $id, string $praSj = 'PSJ-0001')
    {
        return $this->postJson($this->url("{$id}/transfer"), ['pra_sj_number' => $praSj]);
    }

    private function recordIssueStep(int $id, string $ref = 'ISS-0001')
    {
        return $this->postJson($this->url("{$id}/issue"), ['issue_reference' => $ref]);
    }

    private function finish(int $id, string $recipient = 'Pak Budi')
    {
        return $this->postJson($this->url("{$id}/complete"), ['recipient_name' => $recipient]);
    }

    /** Memajukan permintaan sampai tahap tertentu: checked, requested, transferred, issued. */
    private function advance(int $id, string $to): void
    {
        $this->actAs('supervisor');
        $this->onhandAll($id)->assertOk();
        if ($to === 'checked') {
            return;
        }
        $this->recordMove($id, 'MIR-'.$id)->assertOk(); // nomor dibuat unik per permintaan
        if ($to === 'requested') {
            return;
        }
        $this->actAs('warehouse');
        $this->recordTransferStep($id, 'PSJ-'.$id)->assertOk();
        if ($to === 'transferred') {
            return;
        }
        $this->actAs('supervisor');
        $this->recordIssueStep($id, 'ISS-'.$id)->assertOk();
    }

    public function test_only_approved_events_can_be_chosen_for_display_support(): void
    {
        $ok = $this->makeEvent('Bazaar Ramadan');
        $this->makeEvent('Event Menunggu', 'EVENT', 'PENDING_APPROVAL');
        $this->makeEvent('Branding Toko', 'BRANDING');
        $this->actAs('supervisor');

        $r = $this->getJson($this->url('events'))->assertOk();

        $this->assertSame([$ok->id], array_column($r->json('data'), 'id'));
        $this->assertSame('Bazaar Ramadan', $r->json('data.0.description'));
        $this->assertSame($ok->event_code, $r->json('data.0.event_code'));
        $this->assertSame('2026-11-01', $r->json('data.0.start_date'));
    }

    public function test_marketing_creates_a_request_for_an_approved_event(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor', ['name' => 'Bu Marketing']);

        $r = $this->postJson($this->url(), $this->payload($event->id))->assertStatus(201);

        $this->assertSame('MV-'.now()->format('Y').'-00001', $r->json('data.req_no'));
        $this->assertSame('NEW', $r->json('data.status'));
        $this->assertSame('Bazaar Ramadan', $r->json('data.event.description'));
        $this->assertSame('Bu Marketing', $r->json('data.creator.name'));
        $this->assertSame(['P-001', 'P-002'], array_column($r->json('data.items'), 'part_num'));
        $this->assertEquals([10, 2.5], array_column($r->json('data.items'), 'qty'));
        $this->assertNull($r->json('data.items.0.onhand_qty'));
        $this->assertTrue($r->json('data.flags.can_edit'));
        $this->assertTrue($r->json('data.flags.can_check'));
        $this->assertFalse($r->json('data.flags.can_request'));
        $this->assertStringContainsString('cek On-Hand', $r->json('data.awaiting_label'));
        $this->assertSame('MV-'.now()->format('Y').'-00002', $this->postJson($this->url(), $this->payload($event->id))->json('data.req_no'));
    }

    public function test_the_event_and_items_are_validated(): void
    {
        $event = $this->makeEvent();
        $pending = $this->makeEvent('Event Menunggu', 'EVENT', 'PENDING_APPROVAL');
        $branding = $this->makeEvent('Branding', 'BRANDING');
        $this->actAs('supervisor');

        $this->postJson($this->url(), $this->payload($pending->id))->assertStatus(422);                 // event belum disetujui
        $this->postJson($this->url(), $this->payload($branding->id))->assertStatus(422);                // bukan event
        $this->postJson($this->url(), $this->payload(99999))->assertStatus(422);
        $this->postJson($this->url(), ['event_id' => '', 'items' => $this->payload($event->id)['items']])->assertStatus(422);
        $this->postJson($this->url(), $this->payload($event->id, ['items' => []]))->assertStatus(422);
        $this->postJson($this->url(), $this->payload($event->id, ['items' => [['part_num' => 'P-001', 'qty' => 0]]]))->assertStatus(422);
        $this->postJson($this->url(), $this->payload($event->id, ['items' => [['part_num' => 'P-001', 'qty' => 1], ['part_num' => 'p-001', 'qty' => 2]]]))->assertStatus(422); // kode ganda
        $unknown = $this->postJson($this->url(), $this->payload($event->id, ['items' => [['part_num' => 'TIDAK-ADA', 'qty' => 1]]]))->assertStatus(422);
        $this->assertStringContainsString('tidak ada di Part Master', $unknown->json('message'));
        $this->assertSame(0, MarketingMoveRequest::count());
    }

    public function test_the_request_can_be_changed_only_before_the_on_hand_check(): void
    {
        $event = $this->makeEvent();
        $other = $this->makeEvent('Pameran Produk');
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);

        $r = $this->putJson($this->url((string) $id), $this->payload($other->id, ['items' => [['part_num' => 'P-002', 'qty' => 7]]]))->assertOk();
        $this->assertSame('Pameran Produk', $r->json('data.event.description'));
        $this->assertSame(['P-002'], array_column($r->json('data.items'), 'part_num')); // diganti, bukan ditambah

        $this->onhandAll($id)->assertOk();
        $this->putJson($this->url((string) $id), $this->payload($event->id))->assertStatus(422);
    }

    public function test_the_on_hand_check_needs_a_quantity_for_every_item_and_allows_zero(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);
        $items = MarketingMoveRequest::find($id)->items;

        $this->postJson($this->url("{$id}/onhand"), [])->assertStatus(422);
        $this->postJson($this->url("{$id}/onhand"), ['onhand' => [['item_id' => $items[0]->id, 'onhand_qty' => 3]]])->assertStatus(422);   // barang kedua kosong
        $this->postJson($this->url("{$id}/onhand"), ['onhand' => [['item_id' => $items[0]->id, 'onhand_qty' => 3], ['item_id' => $items[1]->id, 'onhand_qty' => -1]]])->assertStatus(422);
        $this->assertSame('NEW', MarketingMoveRequest::find($id)->status);

        $r = $this->postJson($this->url("{$id}/onhand"), [
            'onhand' => [['item_id' => $items[0]->id, 'onhand_qty' => 3], ['item_id' => $items[1]->id, 'onhand_qty' => 0]], 'notes' => 'Banner tinggal 3',
        ])->assertOk();

        $this->assertSame('CHECKED', $r->json('data.status'));
        $this->assertEquals([3, 0], array_column($r->json('data.items'), 'onhand_qty'));
        $this->assertSame('Banner tinggal 3', $r->json('data.onhand_notes'));
        $this->assertTrue($r->json('data.flags.can_request'));
        $this->onhandAll($id)->assertStatus(422); // hanya sekali
    }

    public function test_marketing_records_the_move_inventory_request_number_which_must_be_unique(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $a = $this->createReq($event->id);
        $b = $this->createReq($event->id);

        $this->recordMove($a)->assertStatus(422); // On-Hand belum diperiksa
        $this->onhandAll($a)->assertOk();
        $this->postJson($this->url("{$a}/move-request"), [])->assertStatus(422);

        $r = $this->recordMove($a, ' MIR-0001 ')->assertOk();
        $this->assertSame('REQUESTED', $r->json('data.status'));
        $this->assertSame('MIR-0001', $r->json('data.epicor_request_no'));
        $this->assertStringContainsString('Warehouse', $r->json('data.awaiting_label'));
        $this->recordMove($a, 'MIR-0002')->assertStatus(422); // sudah dicatat

        $this->onhandAll($b)->assertOk();
        $this->recordMove($b, 'MIR-0001')->assertStatus(422); // nomor dipakai permintaan lain
        $this->recordMove($b, 'MIR-0003')->assertOk();
    }

    public function test_only_warehouse_runs_the_inventory_transfer_and_the_pra_sj_must_be_unique(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $a = $this->createReq($event->id);
        $b = $this->createReq($event->id);
        $this->advance($a, 'requested');
        $this->advance($b, 'requested');

        $this->actAs('supervisor');
        $this->recordTransferStep($a)->assertStatus(403); // Marketing bukan Warehouse

        $this->actAs('warehouse');
        $this->postJson($this->url("{$a}/transfer"), [])->assertStatus(422);
        $r = $this->recordTransferStep($a, ' PSJ-0001 ')->assertOk();
        $this->assertSame('TRANSFERRED', $r->json('data.status'));
        $this->assertSame('PSJ-0001', $r->json('data.pra_sj_number'));
        $this->assertStringContainsString('Issue Misc. Material', $r->json('data.awaiting_label'));
        $this->recordTransferStep($a, 'PSJ-0002')->assertStatus(422); // sudah dicatat

        $this->recordTransferStep($b, 'PSJ-0001')->assertStatus(422); // Pra-SJ dipakai permintaan lain
        $this->recordTransferStep($b, 'PSJ-0003')->assertOk();
    }

    public function test_the_transfer_waits_for_the_move_inventory_request(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);
        $this->onhandAll($id)->assertOk();

        $this->actAs('warehouse');
        $this->recordTransferStep($id)->assertStatus(422); // Move Inventory Request belum dicatat
        $this->assertSame('CHECKED', MarketingMoveRequest::find($id)->status);
    }

    public function test_marketing_issues_the_material_after_the_transfer(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);
        $this->advance($id, 'requested');
        $this->actAs('supervisor');
        $this->recordIssueStep($id)->assertStatus(422); // belum ditransfer Warehouse

        $this->actAs('warehouse');
        $this->recordTransferStep($id)->assertOk();
        $this->recordIssueStep($id)->assertStatus(403); // Warehouse bukan Marketing

        $this->actAs('supervisor');
        $this->postJson($this->url("{$id}/issue"), [])->assertStatus(422);
        $r = $this->recordIssueStep($id, ' ISS-0001 ')->assertOk();
        $this->assertSame('ISSUED', $r->json('data.status'));
        $this->assertSame('ISS-0001', $r->json('data.issue_reference'));
        $this->assertTrue($r->json('data.flags.can_complete'));
        $this->recordIssueStep($id)->assertStatus(422);
    }

    public function test_the_recipient_and_the_event_name_become_the_remarks(): void
    {
        $event = $this->makeEvent('Bazaar Ramadan');
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);
        $this->advance($id, 'issued');
        $this->actAs('supervisor');
        $this->postJson($this->url("{$id}/complete"), [])->assertStatus(422); // penerima wajib

        $r = $this->finish($id, ' Pak Budi ')->assertOk();

        $this->assertSame('DONE', $r->json('data.status'));
        $this->assertSame('Pak Budi', $r->json('data.recipient_name'));
        $this->assertSame('Pak Budi / Bazaar Ramadan', $r->json('data.remarks')); // penerima dan nama event pada Remarks
        $this->assertNull($r->json('data.awaiting_label'));
        $this->assertFalse($r->json('data.flags.can_complete'));
        $this->finish($id)->assertStatus(422); // tidak bisa dua kali
    }

    public function test_the_steps_must_follow_the_order_of_the_diagram(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);

        $this->recordMove($id)->assertStatus(422);
        $this->recordIssueStep($id)->assertStatus(422);
        $this->finish($id)->assertStatus(422);
        $this->actAs('warehouse');
        $this->recordTransferStep($id)->assertStatus(422);
        $this->assertSame('NEW', MarketingMoveRequest::find($id)->status);
    }

    public function test_the_list_shows_who_has_to_act_next(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $new = $this->createReq($event->id);
        $requested = $this->createReq($event->id);
        $this->advance($requested, 'requested');

        $this->actAs('supervisor');
        $mine = $this->getJson($this->url())->assertOk();
        $this->assertSame([$requested, $new], array_column($mine->json('data'), 'id')); // terbaru dulu
        $this->assertSame([false, true], array_column($mine->json('data'), 'can_act'));  // menunggu Warehouse; permintaan baru menunggu Marketing
        $this->assertSame(2, $mine->json('data.0.items_count'));
        $this->assertSame('Bazaar Ramadan', $mine->json('data.0.event.description'));

        $this->actAs('warehouse');
        $wh = $this->getJson($this->url())->assertOk();
        $this->assertSame([true, false], array_column($wh->json('data'), 'can_act')); // giliran Warehouse hanya pada yang sudah di-request

        $this->assertCount(1, $this->getJson($this->url().'?q='.MarketingMoveRequest::find($new)->req_no)->json('data'));
        $this->assertCount(0, $this->getJson($this->url().'?q=tidak-ada')->json('data'));
    }

    public function test_warehouse_can_see_requests_but_cannot_create_or_change_them(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);

        $this->actAs('warehouse');
        $this->getJson($this->url((string) $id))->assertOk();
        $this->postJson($this->url(), $this->payload($event->id))->assertStatus(403);
        $this->putJson($this->url((string) $id), $this->payload($event->id))->assertStatus(403);
        $this->onhandAll($id)->assertStatus(403);
        $this->assertSame('NEW', MarketingMoveRequest::find($id)->status);
    }

    public function test_other_roles_cannot_use_move_requests_and_the_roles_come_from_the_config(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);

        foreach (['sales', 'finance'] as $role) {
            $this->actAs($role);
            $this->getJson($this->url())->assertStatus(403);
            $this->getJson($this->url('events'))->assertStatus(403);
            $this->getJson($this->url((string) $id))->assertStatus(403);
            $this->postJson($this->url(), $this->payload($event->id))->assertStatus(403);
        }

        config(['marketing.move_request.roles.marketing' => ['finance']]);
        $this->actAs('finance');
        $this->onhandAll($id)->assertOk();
        $this->actAs('supervisor');
        $this->recordMove($id)->assertStatus(403); // supervisor tidak lagi Marketing
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        $event = $this->makeEvent();
        $this->actAs('supervisor');
        $id = $this->createReq($event->id);
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
        $this->getJson($this->url('events'))->assertStatus(401);
        $this->getJson($this->url('1'))->assertStatus(401);
        $this->postJson($this->url(), [])->assertStatus(401);
        $this->postJson($this->url('1/complete'), [])->assertStatus(401);

        $this->actAs('supervisor');
        $this->getJson($this->url('999'))->assertStatus(404);
        $this->recordMove(999)->assertStatus(404);
        $this->finish(999)->assertStatus(404);
    }
}