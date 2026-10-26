<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingClaim;
use App\Models\MarketingClaimAttachment;
use App\Models\MarketingClaimGoods;
use App\Models\MarketingEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.13 / MKT13: Metode Pencairan Program, Barang (Reward). */
class MarketingGoodsTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function user(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(string $role, array $attrs = []): User
    {
        $u = $this->user($role, $attrs);
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

    private function program(): MarketingEvent
    {
        if ($existing = MarketingEvent::where('activity_type', 'KLAIM')->first()) {
            return $existing;
        }
        $this->actAs('admin');
        Customer::firstOrCreate(['customer_code' => 'SEED'], ['name' => 'Seed', 'active' => true]);
        $budget = MarketingBudget::first() ?? MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 100000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        $id = $this->postJson('/api/v1/marketing/claim-programs', [
            'marketing_budget_id' => $budget->id, 'description' => 'Reward Q4', 'reference_letter_no' => 'SKP/'.uniqid(),
            'claim_type' => 'REWARD', 'claim_source' => 'SELL_OUT', 'claim_basis' => 'SALES_VALUE', 'claim_rate_type' => 'PERCENT',
            'claim_rate' => 2.5, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'claim_deadline' => '2026-12-15',
            'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201)->json('data.id');

        return MarketingEvent::find($id);
    }

    /** Klaim yang sudah disetujui dengan metode Barang. */
    private function claim(array $over = []): MarketingClaim
    {
        $this->parts();
        $program = $this->program();
        $this->seq++;
        $distributor = Customer::create(['customer_code' => 'DIST'.$this->seq, 'name' => 'Distributor '.$this->seq, 'city' => 'Surabaya', 'active' => true]);

        return MarketingClaim::create($over + [
            'claim_no' => 'CLM-2026-'.str_pad((string) $this->seq, 5, '0', STR_PAD_LEFT),
            'marketing_event_id' => $program->id, 'customer_id' => $distributor->id, 'letter_received_date' => '2026-12-10',
            'claimed_amount' => 12000, 'eligible_amount' => 10000, 'difference_amount' => 2000, 'status' => 'APPROVED',
            'approved_amount' => 10000, 'payout_method' => 'BARANG', 'approval_stage' => 4,
        ]);
    }

    private function url(int $id, string $action = ''): string
    {
        return "/api/v1/marketing/goods-claims/{$id}".($action ? "/{$action}" : '');
    }

    private function setReward(int $id, ?array $items = null)
    {
        return $this->postJson($this->url($id, 'items'), ['items' => $items ?? [['part_num' => 'P-001', 'qty' => 5, 'description' => 'Saus botol'], ['part_num' => 'P-002', 'qty' => 2.5]]]);
    }

    private function stockCheck(int $id, bool $available, ?string $notes = null)
    {
        return $this->postJson($this->url($id, 'stock-check'), ['available' => $available, 'notes' => $notes]);
    }

    private function recordRequisition(int $id, string $number = 'PR-0001')
    {
        return $this->postJson($this->url($id, 'requisition'), ['requisition_number' => $number]);
    }

    private function confirmReceipt(int $id)
    {
        return $this->postJson($this->url($id, 'receipt'));
    }

    private function recordShipment(int $id, string $reason = 'REWARD')
    {
        return $this->postJson($this->url($id, 'shipment'), ['reason_code' => $reason]);
    }

    private function recordIssue(int $id, string $reference = 'ISS-0001')
    {
        return $this->postJson($this->url($id, 'issue'), ['issue_reference' => $reference]);
    }

    private function recordHandover(int $id, array $over = [])
    {
        return $this->post($this->url($id, 'handover'), $over + [
            'recipient_name' => 'Pak Budi',
            'files' => [UploadedFile::fake()->create('serah-terima.pdf', 50, 'application/pdf')],
        ], ['Accept' => 'application/json']);
    }

    /** Memajukan klaim sampai tahap tertentu: items, ready (stok tersedia), requisition, shipped, issued. */
    private function advance(int $id, string $to): void
    {
        $this->setReward($id)->assertOk();
        if ($to === 'items') {
            return;
        }
        if ($to === 'requisition') {
            $this->stockCheck($id, false)->assertOk();

            return;
        }
        $this->stockCheck($id, true)->assertOk();
        if ($to === 'ready') {
            return;
        }
        $this->recordShipment($id)->assertOk();
        if ($to === 'shipped') {
            return;
        }
        $this->recordIssue($id)->assertOk();
    }

    public function test_the_list_only_has_approved_barang_claims_not_yet_disbursed(): void
    {
        $open = $this->claim();
        $this->claim(['payout_method' => 'TRANSFER']);
        $this->claim(['status' => 'IN_APPROVAL']);
        $this->claim(['status' => 'DISBURSED']);
        $this->actAs('supervisor');
        $this->setReward($open->id)->assertOk();

        $r = $this->getJson('/api/v1/marketing/goods-claims')->assertOk();

        $this->assertSame([$open->id], array_column($r->json('data'), 'id'));
        $this->assertSame('SET', $r->json('data.0.goods_status'));
        $this->assertSame(2, $r->json('data.0.items_count'));
        $this->assertCount(1, $this->getJson('/api/v1/marketing/goods-claims?q='.$open->claim_no)->json('data'));
        $this->assertCount(0, $this->getJson('/api/v1/marketing/goods-claims?q=tidak-ada')->json('data'));
    }

    public function test_marketing_sets_the_goods_and_quantities_of_the_reward(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor', ['name' => 'Bu Marketing']);

        $before = $this->getJson($this->url($c->id))->assertOk();
        $this->assertNull($before->json('data.goods'));
        $this->assertTrue($before->json('data.flags.can_items'));
        $this->assertFalse($before->json('data.flags.can_stock')); // belum ada Reward

        $r = $this->setReward($c->id)->assertOk();

        $this->assertSame('SET', $r->json('data.goods.status'));
        $this->assertSame(['P-001', 'P-002'], array_column($r->json('data.goods.items'), 'part_num'));
        $this->assertEquals([5, 2.5], array_column($r->json('data.goods.items'), 'qty'));
        $this->assertSame('Saus botol', $r->json('data.goods.items.0.description'));
        $this->assertSame('Bu Marketing', $r->json('data.goods.actors.set_by'));
        $this->assertTrue($r->json('data.flags.can_stock'));
        $this->assertSame(20, $r->json('data.flags.max_items'));
    }

    public function test_the_reward_items_are_validated_against_the_part_master(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');

        $this->setReward($c->id, [])->assertStatus(422);
        $this->setReward($c->id, [['part_num' => 'P-001', 'qty' => 0]])->assertStatus(422);
        $this->setReward($c->id, [['part_num' => 'P-001', 'qty' => -1]])->assertStatus(422);
        $this->setReward($c->id, [['part_num' => '', 'qty' => 1]])->assertStatus(422);
        $this->setReward($c->id, [['part_num' => 'P-001', 'qty' => 1], ['part_num' => 'p-001', 'qty' => 2]])->assertStatus(422); // kode ganda
        $unknown = $this->setReward($c->id, [['part_num' => 'TIDAK-ADA', 'qty' => 1]])->assertStatus(422);
        $this->assertStringContainsString('tidak ada di Part Master', $unknown->json('message'));
        $this->setReward($c->id, array_map(fn ($i) => ['part_num' => 'P-001', 'qty' => $i], range(1, 21)))->assertStatus(422); // melebihi batas
        $this->assertSame(0, MarketingClaimGoods::count());

        $this->setReward($c->id, [['part_num' => 'p-001', 'qty' => 1]])->assertOk(); // kode part tidak membedakan huruf besar-kecil
    }

    public function test_the_reward_can_be_changed_only_until_the_stock_is_checked(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->setReward($c->id)->assertOk();

        $changed = $this->setReward($c->id, [['part_num' => 'P-002', 'qty' => 9]])->assertOk();
        $this->assertSame(['P-002'], array_column($changed->json('data.goods.items'), 'part_num')); // diganti, bukan ditambah

        $this->stockCheck($c->id, true)->assertOk();
        $this->setReward($c->id, [['part_num' => 'P-001', 'qty' => 1]])->assertStatus(422);
        $this->assertSame(['P-002'], MarketingClaimGoods::first()->items->pluck('part_num')->all());
    }

    public function test_check_stock_available_makes_the_goods_ready(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->stockCheck($c->id, true)->assertStatus(422); // Reward belum diatur
        $this->setReward($c->id)->assertOk();

        $r = $this->stockCheck($c->id, true, 'Stok cukup di gudang Marketing')->assertOk();

        $this->assertSame('READY', $r->json('data.goods.status'));
        $this->assertTrue($r->json('data.goods.stock_available'));
        $this->assertSame('Stok cukup di gudang Marketing', $r->json('data.goods.stock_notes'));
        $this->assertTrue($r->json('data.flags.can_shipment'));
        $this->assertFalse($r->json('data.flags.can_requisition'));
        $this->stockCheck($c->id, true)->assertStatus(422); // hanya sekali
    }

    public function test_check_stock_not_available_needs_a_requisition_and_a_receipt_before_the_goods_are_ready(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->setReward($c->id)->assertOk();

        $r = $this->stockCheck($c->id, false)->assertOk();
        $this->assertSame('REQUISITION', $r->json('data.goods.status'));
        $this->assertFalse($r->json('data.goods.stock_available'));
        $this->assertTrue($r->json('data.flags.can_requisition'));
        $this->assertFalse($r->json('data.flags.can_receive')); // nomor Requisition belum ada
        $this->assertFalse($r->json('data.flags.can_shipment'));

        $this->confirmReceipt($c->id)->assertStatus(422);   // belum ada Requisition
        $this->recordShipment($c->id)->assertStatus(422);   // barang belum siap
        $this->postJson($this->url($c->id, 'requisition'), [])->assertStatus(422);

        $pr = $this->recordRequisition($c->id, ' PR-0001 ')->assertOk();
        $this->assertSame('REQUISITION', $pr->json('data.goods.status'));
        $this->assertSame('PR-0001', $pr->json('data.goods.requisition_number'));
        $this->assertTrue($pr->json('data.flags.can_receive'));

        $ready = $this->confirmReceipt($c->id)->assertOk();
        $this->assertSame('READY', $ready->json('data.goods.status'));
        $this->assertNotNull($ready->json('data.goods.received_at'));
        $this->assertTrue($ready->json('data.flags.can_shipment'));
        $this->recordRequisition($c->id, 'PR-0002')->assertStatus(422); // sudah siap
    }

    public function test_a_requisition_is_only_for_goods_whose_stock_is_not_available(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->advance($c->id, 'ready');

        $this->recordRequisition($c->id)->assertStatus(422);
        $this->confirmReceipt($c->id)->assertStatus(422);
        $this->assertNull(MarketingClaimGoods::first()->requisition_number);
    }

    public function test_misc_shipment_records_the_reason_code_and_follows_ready_goods(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->setReward($c->id)->assertOk();
        $this->recordShipment($c->id)->assertStatus(422); // Check Stock belum dilakukan
        $this->stockCheck($c->id, true)->assertOk();
        $this->postJson($this->url($c->id, 'shipment'), [])->assertStatus(422); // Reason Code wajib

        $r = $this->recordShipment($c->id, ' REWARD-KLAIM ')->assertOk();

        $this->assertSame('SHIPPED', $r->json('data.goods.status'));
        $this->assertSame('REWARD-KLAIM', $r->json('data.goods.shipment_reason_code'));
        $this->assertTrue($r->json('data.flags.can_issue'));
        $this->recordShipment($c->id)->assertStatus(422);
    }

    public function test_issue_misc_material_follows_the_misc_shipment(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->advance($c->id, 'ready');
        $this->recordIssue($c->id)->assertStatus(422); // Misc. Shipment belum dicatat

        $this->recordShipment($c->id)->assertOk();
        $this->postJson($this->url($c->id, 'issue'), [])->assertStatus(422); // nomor dokumen wajib

        $r = $this->recordIssue($c->id, ' ISS-0001 ')->assertOk();

        $this->assertSame('ISSUED', $r->json('data.goods.status'));
        $this->assertSame('ISS-0001', $r->json('data.goods.issue_reference'));
        $this->assertTrue($r->json('data.flags.can_handover'));
        $this->recordIssue($c->id)->assertStatus(422);
    }

    public function test_the_handover_needs_a_recipient_and_a_signed_proof_then_the_claim_is_disbursed(): void
    {
        Storage::fake('public');
        $c = $this->claim();
        $this->actAs('supervisor', ['name' => 'Bu Marketing']);
        $this->advance($c->id, 'shipped');
        $this->recordHandover($c->id)->assertStatus(422); // barang belum dikeluarkan (Issue Misc. Material)

        $this->recordIssue($c->id)->assertOk();
        $this->recordHandover($c->id, ['recipient_name' => ''])->assertStatus(422);
        $this->recordHandover($c->id, ['files' => []])->assertStatus(422);                                                       // bukti wajib dilampirkan
        $this->recordHandover($c->id, ['files' => [UploadedFile::fake()->create('virus.exe', 10, 'application/x-msdownload')]])->assertStatus(422); // hanya foto atau PDF
        $this->assertSame('ISSUED', MarketingClaimGoods::first()->status);
        $this->assertSame(0, MarketingClaimAttachment::where('kind', 'HANDOVER')->count());

        $r = $this->recordHandover($c->id)->assertOk();

        $this->assertSame('DISBURSED', $r->json('data.status'));
        $this->assertSame('HANDED_OVER', $r->json('data.goods.status'));
        $this->assertSame('Pak Budi', $r->json('data.goods.recipient_name'));
        $this->assertSame($c->claim_no.' / Pak Budi', $r->json('data.goods.reference')); // Code Klaim dan nama penerima pada Reference
        $this->assertSame('Bu Marketing', $r->json('data.goods.actors.handed_over_by'));
        $this->assertFalse($r->json('data.flags.can_handover'));

        $attachment = MarketingClaimAttachment::where('marketing_claim_id', $c->id)->where('kind', 'HANDOVER')->first();
        $this->assertNotNull($attachment);
        $this->assertSame('serah-terima.pdf', $attachment->filename);
        Storage::disk('public')->assertExists($attachment->path); // bukti serah terima terlampir pada klaim

        $this->recordHandover($c->id)->assertStatus(422); // tidak bisa dua kali
        $this->assertCount(0, $this->getJson('/api/v1/marketing/goods-claims')->json('data'));
        $this->assertSame('DISBURSED', $this->getJson($this->url($c->id))->assertOk()->json('data.status'));
    }

    public function test_the_steps_must_follow_the_order_of_the_diagram(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');

        $this->stockCheck($c->id, true)->assertStatus(422);
        $this->recordRequisition($c->id)->assertStatus(422);
        $this->confirmReceipt($c->id)->assertStatus(422);
        $this->recordShipment($c->id)->assertStatus(422);
        $this->recordIssue($c->id)->assertStatus(422);
        $this->recordHandover($c->id)->assertStatus(422);
        $this->assertSame(0, MarketingClaimGoods::count());
    }

    public function test_a_disbursed_claim_can_no_longer_be_calculated_or_submitted(): void
    {
        Storage::fake('public');
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->advance($c->id, 'issued');
        $this->recordHandover($c->id)->assertOk();

        $this->postJson("/api/v1/marketing/claims/{$c->id}/calculate")->assertStatus(422);
        $this->postJson("/api/v1/marketing/claims/{$c->id}/submit", ['payout_method' => 'POTONG_NOTA'])->assertStatus(422);
        $this->assertSame('BARANG', MarketingClaim::find($c->id)->payout_method);
    }

    public function test_only_approved_barang_claims_can_be_worked_on(): void
    {
        $transfer = $this->claim(['payout_method' => 'TRANSFER']);
        $pending = $this->claim(['status' => 'IN_APPROVAL']);
        $this->actAs('supervisor');

        foreach ([$transfer, $pending] as $c) {
            $this->getJson($this->url($c->id))->assertStatus(404);
            $this->setReward($c->id)->assertStatus(404);
            $this->stockCheck($c->id, true)->assertStatus(404);
            $this->recordHandover($c->id)->assertStatus(404);
        }
        $this->getJson($this->url(999))->assertStatus(404);
        $this->assertSame(0, MarketingClaimGoods::count());
    }

    public function test_supervisor_and_admin_can_work_on_goods_but_other_roles_cannot(): void
    {
        $c = $this->claim();

        foreach (['sales', 'finance', 'warehouse'] as $role) {
            $this->actAs($role);
            $this->getJson('/api/v1/marketing/goods-claims')->assertStatus(403);
            $this->getJson($this->url($c->id))->assertStatus(403);
            $this->setReward($c->id)->assertStatus(403);
            $this->stockCheck($c->id, true)->assertStatus(403);
            $this->recordHandover($c->id)->assertStatus(403);
        }
        $this->assertSame(0, MarketingClaimGoods::count());

        $this->actAs('admin');
        $this->setReward($c->id)->assertOk();

        config(['marketing.claim_goods.roles' => ['warehouse']]);
        $this->actAs('warehouse');
        $this->stockCheck($c->id, true)->assertOk();
        $this->actAs('supervisor');
        $this->getJson('/api/v1/marketing/goods-claims')->assertStatus(403);
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        Storage::fake('public');
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->advance($c->id, 'issued');
        $this->recordHandover($c->id)->assertOk();

        foreach (['goods_items', 'goods_stock', 'goods_shipment', 'goods_issue', 'goods_handover'] as $step) {
            $this->assertTrue(AuditLog::where('action', "marketing_claim.{$step}")->where('entity_id', $c->id)->exists(), $step);
        }
    }

    public function test_the_requisition_path_is_audited_too(): void
    {
        $c = $this->claim();
        $this->actAs('supervisor');
        $this->advance($c->id, 'requisition');
        $this->recordRequisition($c->id)->assertOk();
        $this->confirmReceipt($c->id)->assertOk();

        foreach (['goods_requisition', 'goods_receipt'] as $step) {
            $this->assertTrue(AuditLog::where('action', "marketing_claim.{$step}")->where('entity_id', $c->id)->exists(), $step);
        }
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/marketing/goods-claims')->assertStatus(401);
        $this->getJson('/api/v1/marketing/goods-claims/1')->assertStatus(401);
        foreach (['items', 'stock-check', 'requisition', 'receipt', 'shipment', 'issue', 'handover'] as $action) {
            $this->postJson('/api/v1/marketing/goods-claims/1/'.$action, [])->assertStatus(401);
        }
    }
}