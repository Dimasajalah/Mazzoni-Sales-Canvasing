<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\PurchaseRequisition;
use App\Models\PurchaseRequisitionAttachment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Blueprint MJU 3.2.14 / PR01: Requisition User (Reward dan Design).
 * Peran bawaan: User, PIC Dept, dan Manager Dept = supervisor; Direktur, Purchasing, dan IT = admin.
 */
class PurchaseRequisitionTest extends TestCase
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

    private function url(int $id, string $action = ''): string
    {
        return "/api/v1/purchasing/requisitions/{$id}".($action ? "/{$action}" : '');
    }

    private function payload(array $over = []): array
    {
        $this->parts();

        return $over + [
            'category' => 'REWARD', 'needed_date' => now()->addDays(14)->toDateString(), 'is_rab' => false, 'notes' => 'Reward Q4',
            'lines' => [['part_num' => 'P-001', 'qty' => 10, 'unit_price' => 1000], ['part_num' => 'P-002', 'qty' => 5, 'description' => 'Poster']],
        ];
    }

    /** Membuat PR sebagai pengguna yang sedang login; mengembalikan id. */
    private function createPr(array $over = []): int
    {
        return $this->postJson('/api/v1/purchasing/requisitions', $this->payload($over))->assertStatus(201)->json('data.id');
    }

    private function pdf(string $name = 'rab.pdf'): UploadedFile
    {
        return UploadedFile::fake()->create($name, 50, 'application/pdf');
    }

    private function submitPr(int $id)
    {
        return $this->postJson($this->url($id, 'submit'));
    }

    private function approvePr(int $id, array $over = [])
    {
        return $this->postJson($this->url($id, 'approve'), $over + ['reason_code' => 'SESUAI_ANGGARAN']);
    }

    private function rejectPr(int $id, array $over = [])
    {
        return $this->postJson($this->url($id, 'reject'), $over + ['reason_code' => 'DOKUMEN_KURANG']);
    }

    private function forwardPr(int $id, string $target = 'PO_BOP_SUPPLIER')
    {
        return $this->postJson($this->url($id, 'dispatch'), ['target' => $target]);
    }

    /** PR yang diajukan supervisor dan disetujui Manager Dept tanpa Direktur: sekarang menunggu Purchasing. */
    private function prAtPurchasing(): int
    {
        $this->actAs('supervisor');
        $id = $this->createPr();
        $this->submitPr($id)->assertOk();
        $this->approvePr($id)->assertOk();

        return $id;
    }

    public function test_the_user_enters_the_header_and_lines_as_a_draft(): void
    {
        $this->actAs('supervisor', ['name' => 'Bu User']);

        $r = $this->postJson('/api/v1/purchasing/requisitions', $this->payload())->assertStatus(201);

        $this->assertSame('PR-'.now()->format('Y').'-00001', $r->json('data.pr_no'));
        $this->assertSame('DRAFT', $r->json('data.status'));
        $this->assertSame('Reward', $r->json('data.category_label'));
        $this->assertSame('Bu User', $r->json('data.requester.name'));
        $this->assertSame(['P-001', 'P-002'], array_column($r->json('data.lines'), 'part_num'));
        $this->assertSame([1, 2], array_column($r->json('data.lines'), 'line_no'));
        $this->assertSame([true, true], array_column($r->json('data.lines'), 'part_registered'));
        $this->assertEquals(10000, $r->json('data.total_amount')); // 10 x 1.000; baris tanpa harga dihitung 0
        $this->assertFalse($r->json('data.requires_director'));
        $this->assertTrue($r->json('data.flags.can_edit'));
        $this->assertTrue($r->json('data.flags.can_submit'));
        $this->assertSame('User (menyiapkan PR)', $r->json('data.awaiting_label'));
        $this->assertSame(['REWARD', 'DESIGN'], array_column($r->json('data.options.categories'), 'value'));
        $this->assertSame(['PO_BOP_SUPPLIER', 'PO_BOP_LAPANGAN', 'PO_RMPM_LAPANGAN'], array_column($r->json('data.options.dispatch_targets'), 'value'));

        $this->assertSame('PR-'.now()->format('Y').'-00002', $this->postJson('/api/v1/purchasing/requisitions', $this->payload(['category' => 'DESIGN']))->json('data.pr_no'));
    }

    public function test_the_header_and_lines_are_validated(): void
    {
        $this->actAs('supervisor');
        $base = $this->payload();

        $this->postJson('/api/v1/purchasing/requisitions', ['category' => 'LAINNYA'] + $base)->assertStatus(422);
        $this->postJson('/api/v1/purchasing/requisitions', ['needed_date' => now()->subDays(3)->toDateString()] + $base)->assertStatus(422);
        $this->postJson('/api/v1/purchasing/requisitions', ['needed_date' => ''] + $base)->assertStatus(422);
        $this->postJson('/api/v1/purchasing/requisitions', ['lines' => []] + $base)->assertStatus(422);
        $this->postJson('/api/v1/purchasing/requisitions', ['lines' => [['part_num' => '', 'qty' => 1]]] + $base)->assertStatus(422);
        $this->postJson('/api/v1/purchasing/requisitions', ['lines' => [['part_num' => 'P-001', 'qty' => 0]]] + $base)->assertStatus(422);
        $this->postJson('/api/v1/purchasing/requisitions', ['lines' => [['part_num' => 'P-001', 'qty' => 1, 'unit_price' => -5]]] + $base)->assertStatus(422);
        $this->postJson('/api/v1/purchasing/requisitions', ['lines' => [['part_num' => 'P-001', 'qty' => 1], ['part_num' => 'p-001', 'qty' => 2]]] + $base)->assertStatus(422); // kode ganda
        $this->assertSame(0, PurchaseRequisition::count());

        config(['marketing.purchase_requisition.max_lines' => 2]);
        $this->postJson('/api/v1/purchasing/requisitions', ['lines' => [['part_num' => 'P-001', 'qty' => 1], ['part_num' => 'P-002', 'qty' => 1], ['part_num' => 'P-003', 'qty' => 1, 'description' => 'x']]] + $base)->assertStatus(422);
        $this->assertSame(0, PurchaseRequisition::count());
    }

    public function test_a_part_missing_from_the_part_master_waits_for_it_and_blocks_submission(): void
    {
        $this->actAs('supervisor');
        $noDescription = $this->postJson('/api/v1/purchasing/requisitions', $this->payload(['lines' => [['part_num' => 'BARU-1', 'qty' => 3]]]))->assertStatus(422);
        $this->assertStringContainsString('belum terdaftar', $noDescription->json('message'));

        $id = $this->createPr(['lines' => [['part_num' => 'P-001', 'qty' => 1], ['part_num' => 'BARU-1', 'qty' => 3, 'description' => 'Poster A3 baru']]]);
        $r = $this->getJson($this->url($id))->assertOk();

        $this->assertSame([true, false], array_column($r->json('data.lines'), 'part_registered'));
        $this->assertSame('BARU-1', $r->json('data.lines.1.requested_part_num'));
        $this->assertSame(1, $r->json('data.unregistered_count'));
        $this->assertSame('IT (Register New Part)', $r->json('data.awaiting_label'));
        $this->assertFalse($r->json('data.flags.can_register')); // supervisor bukan IT

        $blocked = $this->submitPr($id)->assertStatus(422);
        $this->assertStringContainsString('BARU-1', $blocked->json('message'));
        $this->assertSame('DRAFT', PurchaseRequisition::find($id)->status);

        $this->actAs('admin'); // admin berperan sebagai IT
        $this->assertTrue($this->getJson($this->url($id))->json('data.flags.can_register'));
    }

    public function test_it_registers_the_new_part_and_the_requisition_can_then_be_submitted(): void
    {
        $this->actAs('supervisor');
        $id = $this->createPr(['lines' => [['part_num' => 'P-001', 'qty' => 1], ['part_num' => 'BARU-1', 'qty' => 3, 'description' => 'Poster A3 baru']]]);
        $lineId = $this->getJson($this->url($id))->json('data.lines.1.id');

        $this->postJson($this->url($id, "lines/{$lineId}/register"), ['part_num' => 'P-002'])->assertStatus(403); // bukan IT

        $this->actAs('admin');
        $this->postJson($this->url($id, "lines/{$lineId}/register"), ['part_num' => 'BELUM-ADA'])->assertStatus(422); // belum ada di Part Master
        $this->postJson($this->url($id, "lines/{$lineId}/register"), [])->assertStatus(422);
        $this->postJson($this->url($id, "lines/{$lineId}/register"), ['part_num' => 'p-001'])->assertStatus(422);       // sudah dipakai baris lain

        $r = $this->postJson($this->url($id, "lines/{$lineId}/register"), ['part_num' => 'P-002'])->assertOk();
        $this->assertSame('P-002', $r->json('data.lines.1.part_num'));
        $this->assertTrue($r->json('data.lines.1.part_registered'));
        $this->assertSame(0, $r->json('data.unregistered_count'));
        $this->assertSame('BARU-1', $r->json('data.lines.1.requested_part_num')); // kode awal tetap tercatat
        $this->postJson($this->url($id, "lines/{$lineId}/register"), ['part_num' => 'P-002'])->assertStatus(422);   // sudah terdaftar

        $this->actAs('supervisor'); // bukan pembuatnya, tetapi PIC Dept, jadi boleh mengajukan
        $this->submitPr($id)->assertOk();
    }

    public function test_the_owner_submits_a_regular_requisition_straight_to_the_manager(): void
    {
        $owner = $this->actAs('supervisor');
        $id = $this->createPr();

        $r = $this->submitPr($id)->assertOk();

        $this->assertSame('MANAGER', $r->json('data.status'));
        $this->assertSame(1, $r->json('data.approval_stage'));
        $this->assertSame('Manager Dept', $r->json('data.awaiting_label'));
        $this->assertNotNull($r->json('data.submitted_at'));
        $this->assertFalse($r->json('data.flags.can_edit'));
        $this->submitPr($id)->assertStatus(422); // sudah diajukan
        $this->assertSame($owner->id, PurchaseRequisition::find($id)->requested_by);
    }

    public function test_only_the_owner_or_pic_dept_can_submit_a_draft(): void
    {
        $this->actAs('supervisor', ['name' => 'Pembuat']);
        $id = $this->createPr();

        $this->actAs('admin'); // admin adalah User, tetapi bukan pembuat dan bukan PIC Dept
        $this->submitPr($id)->assertStatus(403);
        $this->assertSame('DRAFT', PurchaseRequisition::find($id)->status);

        config(['marketing.purchase_requisition.roles.pic' => ['admin']]);
        $this->submitPr($id)->assertOk();
    }

    public function test_a_rab_requisition_needs_an_attachment_and_goes_to_pic_dept_for_pricing(): void
    {
        Storage::fake('public');
        $this->actAs('supervisor');
        $id = $this->createPr(['is_rab' => true]);

        $this->submitPr($id)->assertStatus(422); // RAB wajib dilampirkan
        $this->postJson($this->url($id, 'attachments'), [])->assertStatus(422);
        $this->post($this->url($id, 'attachments'), ['files' => [UploadedFile::fake()->create('virus.exe', 10, 'application/x-msdownload')]], ['Accept' => 'application/json'])->assertStatus(422);
        $this->assertSame(0, PurchaseRequisitionAttachment::count());

        $up = $this->post($this->url($id, 'attachments'), ['files' => [$this->pdf('rab-q4.pdf')]], ['Accept' => 'application/json'])->assertOk();
        $this->assertSame('RAB', $up->json('data.attachments.0.kind'));
        $this->assertSame('rab-q4.pdf', $up->json('data.attachments.0.filename'));
        Storage::disk('public')->assertExists(PurchaseRequisitionAttachment::first()->path);

        $r = $this->submitPr($id)->assertOk();
        $this->assertSame('PRICING', $r->json('data.status'));
        $this->assertSame('PIC Dept (update harga purchasing)', $r->json('data.awaiting_label'));
        $this->post($this->url($id, 'attachments'), ['files' => [$this->pdf()]], ['Accept' => 'application/json'])->assertStatus(422); // sudah tidak bisa diubah
    }

    public function test_pic_dept_updates_the_purchasing_prices_of_every_line_before_the_manager(): void
    {
        Storage::fake('public');
        $this->actAs('supervisor');
        $id = $this->createPr(['is_rab' => true]);
        $this->post($this->url($id, 'attachments'), ['files' => [$this->pdf()]], ['Accept' => 'application/json'])->assertOk();
        $this->submitPr($id)->assertOk();
        $lines = $this->getJson($this->url($id))->json('data.lines');
        $price = fn (array $per) => ['prices' => array_map(fn ($l, $p) => ['line_id' => $l['id'], 'unit_price' => $p], $lines, $per)];

        $this->postJson($this->url($id, 'prices'), [])->assertStatus(422);
        $this->postJson($this->url($id, 'prices'), ['prices' => [['line_id' => $lines[0]['id'], 'unit_price' => 2000]]])->assertStatus(422); // baris kedua belum berharga
        $this->postJson($this->url($id, 'prices'), $price([2000, 0]))->assertStatus(422);

        $this->actAs('admin'); // admin bukan PIC Dept
        $this->postJson($this->url($id, 'prices'), $price([2000, 400]))->assertStatus(403);

        $this->actAs('supervisor');
        $r = $this->postJson($this->url($id, 'prices'), $price([2000, 400]))->assertOk();

        $this->assertSame('MANAGER', $r->json('data.status'));
        $this->assertEquals([2000, 400], array_column($r->json('data.lines'), 'unit_price'));
        $this->assertEquals(22000, $r->json('data.total_amount')); // 10 x 2.000 + 5 x 400
        $this->assertNotNull($r->json('data.priced_at'));
        $this->postJson($this->url($id, 'prices'), $price([1, 1]))->assertStatus(422); // sudah lewat tahap harga
    }

    public function test_the_manager_alone_approves_a_regular_requisition_and_it_goes_to_purchasing(): void
    {
        $this->actAs('supervisor', ['name' => 'Pak Manager']);
        $id = $this->createPr();
        $this->approvePr($id)->assertStatus(422); // belum diajukan
        $this->submitPr($id)->assertOk();

        $this->postJson($this->url($id, 'approve'), [])->assertStatus(422);                                // kode alasan wajib
        $this->approvePr($id, ['reason_code' => 'DOKUMEN_KURANG'])->assertStatus(422);                    // kode tolak bukan kode setuju

        $r = $this->approvePr($id, ['notes' => 'Sesuai kebutuhan'])->assertOk();

        $this->assertSame('PURCHASING', $r->json('data.status'));
        $this->assertSame('Purchasing', $r->json('data.awaiting_label'));
        $this->assertSame([1], array_column($r->json('data.approvals'), 'stage'));
        $this->assertSame('Manager Dept', $r->json('data.approvals.0.stage_label'));
        $this->assertSame('APPROVED', $r->json('data.approvals.0.action'));
        $this->assertSame('Sesuai anggaran', $r->json('data.approvals.0.reason_label'));
        $this->assertSame('Pak Manager', $r->json('data.approvals.0.actor.name'));
        $this->assertSame([1], array_column($r->json('data.approval.levels'), 'stage')); // Direktur tidak ikut
    }

    public function test_an_asset_item_needs_the_director_after_the_manager(): void
    {
        $this->actAs('supervisor');
        $id = $this->createPr(['lines' => [['part_num' => 'P-001', 'qty' => 1, 'unit_price' => 500, 'is_asset' => true]]]);
        $this->assertTrue($this->getJson($this->url($id))->json('data.requires_director'));
        $this->submitPr($id)->assertOk();

        $this->actAs('admin');
        $this->approvePr($id)->assertStatus(403); // admin bukan Manager Dept

        $this->actAs('supervisor');
        $afterManager = $this->approvePr($id)->assertOk();
        $this->assertSame('DIRECTOR', $afterManager->json('data.status'));
        $this->assertSame(2, $afterManager->json('data.approval_stage'));
        $this->assertSame('Direktur', $afterManager->json('data.awaiting_label'));
        $this->assertSame([1, 2], array_column($afterManager->json('data.approval.levels'), 'stage'));
        $this->assertFalse($afterManager->json('data.flags.can_decide')); // giliran Direktur
        $this->approvePr($id)->assertStatus(403);                          // supervisor bukan Direktur

        $this->actAs('admin');
        $done = $this->approvePr($id)->assertOk();
        $this->assertSame('PURCHASING', $done->json('data.status'));
        $this->assertSame([1, 2], array_column($done->json('data.approvals'), 'stage'));
        $this->assertSame('Direktur', $done->json('data.approvals.1.stage_label'));
    }

    public function test_more_than_30_million_needs_the_director_but_exactly_30_million_does_not(): void
    {
        $this->actAs('supervisor');
        $exact = $this->createPr(['lines' => [['part_num' => 'P-001', 'qty' => 30000, 'unit_price' => 1000]]]);   // tepat Rp 30.000.000
        $over = $this->createPr(['lines' => [['part_num' => 'P-001', 'qty' => 30001, 'unit_price' => 1000]]]);    // Rp 30.001.000

        $this->assertFalse(PurchaseRequisition::find($exact)->requires_director);
        $this->assertTrue(PurchaseRequisition::find($over)->requires_director);

        $this->submitPr($exact)->assertOk();
        $this->assertSame('PURCHASING', $this->approvePr($exact)->json('data.status'));
        $this->submitPr($over)->assertOk();
        $this->assertSame('DIRECTOR', $this->approvePr($over)->json('data.status'));
    }

    public function test_a_rejection_goes_back_to_pic_dept_for_revision_and_a_new_round_starts_after_resubmission(): void
    {
        $this->actAs('supervisor');
        $id = $this->createPr();
        $this->submitPr($id)->assertOk();

        $rejected = $this->rejectPr($id, ['reason_code' => 'ANGGARAN_TIDAK_SESUAI', 'notes' => 'Jumlah terlalu besar'])->assertOk();
        $this->assertSame('REVISION', $rejected->json('data.status'));
        $this->assertSame('PIC Dept (revisi PR)', $rejected->json('data.awaiting_label'));
        $this->assertSame('REJECTED', $rejected->json('data.approvals.0.action'));
        $this->assertTrue($rejected->json('data.flags.can_edit'));
        $this->assertTrue($rejected->json('data.flags.can_resubmit'));

        $this->actAs('admin');
        $this->postJson($this->url($id, 'resubmit'))->assertStatus(403); // bukan PIC Dept
        $this->putJson($this->url($id), $this->payload())->assertStatus(403);

        $this->actAs('supervisor');
        $revised = $this->putJson($this->url($id), $this->payload(['lines' => [['part_num' => 'P-001', 'qty' => 2, 'unit_price' => 1000]]]))->assertOk();
        $this->assertSame(['P-001'], array_column($revised->json('data.lines'), 'part_num'));
        $this->assertEquals(2000, $revised->json('data.total_amount'));

        $again = $this->postJson($this->url($id, 'resubmit'))->assertOk();
        $this->assertSame('MANAGER', $again->json('data.status'));
        $this->assertSame(2, $again->json('data.approval_round'));
        $this->assertSame(2, $again->json('data.approval.round'));
        $this->assertCount(1, $again->json('data.approvals')); // riwayat putaran 1 tetap tersimpan
        $this->assertSame(1, $again->json('data.approvals.0.round'));

        $approved = $this->approvePr($id)->assertOk();
        $this->assertSame('PURCHASING', $approved->json('data.status'));
        $this->assertSame([1, 2], array_column($approved->json('data.approvals'), 'round'));
    }

    public function test_a_director_rejection_also_returns_to_revision_and_the_director_is_asked_again(): void
    {
        $this->actAs('supervisor');
        $id = $this->createPr(['lines' => [['part_num' => 'P-001', 'qty' => 1, 'unit_price' => 500, 'is_asset' => true]]]);
        $this->submitPr($id)->assertOk();
        $this->approvePr($id)->assertOk();

        $this->actAs('admin');
        $this->assertSame('REVISION', $this->rejectPr($id)->json('data.status'));

        $this->actAs('supervisor');
        $this->assertSame('MANAGER', $this->postJson($this->url($id, 'resubmit'))->json('data.status')); // kembali ke Manager Dept, bukan langsung Direktur
        $this->assertSame('DIRECTOR', $this->approvePr($id)->json('data.status'));

        $this->actAs('admin');
        $this->assertSame('PURCHASING', $this->approvePr($id)->json('data.status'));
    }

    public function test_a_revision_cannot_be_resubmitted_while_a_part_is_unregistered(): void
    {
        $this->actAs('supervisor');
        $id = $this->createPr();
        $this->submitPr($id)->assertOk();
        $this->rejectPr($id)->assertOk();
        $this->putJson($this->url($id), $this->payload(['lines' => [['part_num' => 'BARU-9', 'qty' => 1, 'description' => 'Banner baru']]]))->assertOk();

        $this->postJson($this->url($id, 'resubmit'))->assertStatus(422);
        $this->assertSame('REVISION', PurchaseRequisition::find($id)->status);
    }

    public function test_purchasing_forwards_the_approved_requisition_to_a_purchase_order_process(): void
    {
        $id = $this->prAtPurchasing();

        $this->actAs('supervisor');
        $this->forwardPr($id)->assertStatus(403); // supervisor bukan Purchasing

        $this->actAs('admin');
        $this->postJson($this->url($id, 'dispatch'), [])->assertStatus(422);
        $this->forwardPr($id, 'PO_LAINNYA')->assertStatus(422);

        $r = $this->forwardPr($id, 'PO_RMPM_LAPANGAN')->assertOk();
        $this->assertSame('DISPATCHED', $r->json('data.status'));
        $this->assertSame('PO RMPM Lapangan', $r->json('data.dispatch_target_label'));
        $this->assertNotNull($r->json('data.dispatched_at'));
        $this->assertNull($r->json('data.awaiting_label'));
        $this->forwardPr($id)->assertStatus(422); // sudah diteruskan
    }

    public function test_a_requisition_that_is_not_approved_yet_cannot_be_forwarded(): void
    {
        $this->actAs('supervisor');
        $id = $this->createPr();
        $this->submitPr($id)->assertOk();

        $this->actAs('admin');
        $this->forwardPr($id)->assertStatus(422);
        $this->assertSame('MANAGER', PurchaseRequisition::find($id)->status);
    }

    public function test_the_list_shows_my_requisitions_and_what_waits_for_me(): void
    {
        $this->actAs('supervisor');
        $draft = $this->createPr();
        $waiting = $this->createPr();
        $this->submitPr($waiting)->assertOk();

        $r = $this->getJson('/api/v1/purchasing/requisitions')->assertOk();
        $this->assertSame([$waiting, $draft], array_column($r->json('data'), 'id')); // terbaru dulu
        $this->assertSame(2, $r->json('data.0.lines_count'));
        $this->assertSame('Manager Dept', $r->json('data.0.awaiting_label'));
        $this->assertSame([true, true], array_column($r->json('data'), 'can_act')); // draft: bisa diajukan; menunggu Manager: giliran saya

        $this->actAs('admin'); // admin melihat semua PR, tetapi belum ada yang menunggunya
        $this->assertSame([$waiting, $draft], array_column($this->getJson('/api/v1/purchasing/requisitions')->json('data'), 'id'));
        // admin bukan pembuat, PIC Dept, maupun Manager Dept, jadi tidak ada PR yang menunggu tindakannya
        $this->assertSame([], $this->getJson('/api/v1/purchasing/requisitions?scope=todo')->json('data'));
        $this->assertSame([], $this->getJson('/api/v1/purchasing/requisitions?scope=mine')->json('data'));

        $this->assertCount(1, $this->getJson('/api/v1/purchasing/requisitions?q='.PurchaseRequisition::find($waiting)->pr_no)->json('data'));
        $this->assertCount(0, $this->getJson('/api/v1/purchasing/requisitions?q=tidak-ada')->json('data'));
    }

    public function test_a_user_who_only_plays_the_user_role_sees_only_their_own_requisitions(): void
    {
        config(['marketing.purchase_requisition.roles.user' => ['sales', 'supervisor', 'admin']]);
        $mine = $this->actAs('sales');
        $myPr = $this->createPr();
        $this->actAs('sales');
        $otherPr = $this->createPr();

        $this->actAs('sales');
        $this->assertSame([], $this->getJson('/api/v1/purchasing/requisitions')->json('data'));
        $this->getJson($this->url($myPr))->assertStatus(404);

        Sanctum::actingAs($mine);
        $this->assertSame([$myPr], array_column($this->getJson('/api/v1/purchasing/requisitions')->json('data'), 'id'));
        $this->getJson($this->url($myPr))->assertOk();
        $this->getJson($this->url($otherPr))->assertStatus(404);

        $this->actAs('supervisor'); // PIC dan Manager melihat semua
        $this->assertCount(2, $this->getJson('/api/v1/purchasing/requisitions')->json('data'));
    }

    public function test_other_roles_cannot_use_requisitions(): void
    {
        $this->actAs('supervisor');
        $id = $this->createPr();

        foreach (['sales', 'finance', 'warehouse'] as $role) {
            $this->actAs($role);
            $this->getJson('/api/v1/purchasing/requisitions')->assertStatus(403);
            $this->getJson($this->url($id))->assertStatus(403);
            $this->postJson('/api/v1/purchasing/requisitions', $this->payload())->assertStatus(403);
            $this->submitPr($id)->assertStatus(403);
        }
        $this->assertSame(1, PurchaseRequisition::count());
    }

    public function test_the_roles_come_from_the_config_and_a_requester_outside_the_user_role_cannot_create(): void
    {
        config(['marketing.purchase_requisition.roles.user' => ['admin'], 'marketing.purchase_requisition.roles.manager' => ['finance']]);

        $this->actAs('supervisor'); // masih PIC Dept (bisa melihat), tetapi bukan User pengaju
        $this->postJson('/api/v1/purchasing/requisitions', $this->payload())->assertStatus(403);

        $this->actAs('admin');
        $id = $this->createPr();
        $this->submitPr($id)->assertOk();

        $this->actAs('supervisor');
        $this->approvePr($id)->assertStatus(403); // supervisor tidak lagi Manager Dept
        $this->actAs('finance');
        $this->approvePr($id)->assertOk();
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        $id = $this->prAtPurchasing();
        $this->actAs('admin');
        $this->forwardPr($id)->assertOk();

        foreach (['create', 'submit', 'approve', 'dispatch'] as $step) {
            $this->assertTrue(AuditLog::where('action', "purchase_requisition.{$step}")->where('entity_id', $id)->exists(), $step);
        }
    }

    public function test_the_endpoints_require_login_and_unknown_requisitions_return_404(): void
    {
        $this->getJson('/api/v1/purchasing/requisitions')->assertStatus(401);
        $this->getJson('/api/v1/purchasing/requisitions/1')->assertStatus(401);
        $this->postJson('/api/v1/purchasing/requisitions', [])->assertStatus(401);
        $this->postJson('/api/v1/purchasing/requisitions/1/submit')->assertStatus(401);

        $this->actAs('supervisor');
        $this->getJson($this->url(999))->assertStatus(404);
        $this->submitPr(999)->assertStatus(404);
        $this->postJson($this->url(999, 'approve'), ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(404);
    }
}