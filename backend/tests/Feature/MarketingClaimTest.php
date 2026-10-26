<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingClaim;
use App\Models\MarketingEvent;
use App\Models\MarketingSelloutRow;
use App\Models\MarketingSelloutUpload;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.8 / MKT08: Pengajuan Program Klaim. */
class MarketingClaimTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(User $u): void
    {
        Sanctum::actingAs($u);
    }

    private function distributor(string $code = 'D1'): Customer
    {
        return Customer::where('customer_code', $code)->first() ?? Customer::create(['customer_code' => $code, 'name' => "Distributor {$code}", 'city' => 'Surabaya', 'active' => true]);
    }

    /** Program klaim (sumber Sell Out, nilai penjualan, 2,5%, periode 1-30 Nov, batas klaim 15 Des). Peserta: D1 dan D2. */
    private function program(array $over = [], bool $approved = true): MarketingEvent
    {
        $this->actAs($this->user('admin'));
        $this->distributor('D1');
        $this->distributor('D2');
        $budget = MarketingBudget::first() ?? MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 100000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);

        $id = $this->postJson('/api/v1/marketing/claim-programs', $over + [
            'marketing_budget_id' => $budget->id, 'description' => 'Diskon Saus Q4', 'reference_letter_no' => 'SKP/'.uniqid(),
            'claim_type' => 'DISKON_PRODUK', 'claim_source' => 'SELL_OUT', 'claim_basis' => 'SALES_VALUE', 'claim_rate_type' => 'PERCENT',
            'claim_rate' => 2.5, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'claim_deadline' => '2026-12-15',
            'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201)->json('data.id');

        if ($approved) {
            MarketingEvent::whereKey($id)->update(['status' => 'APPROVED']);
        }

        return MarketingEvent::find($id);
    }

    /** Data sell out valid (atau status lain) untuk program; tiap baris [qty, amount]. */
    private function sellOut(MarketingEvent $p, array $rows, string $status = 'VALID'): MarketingSelloutUpload
    {
        $upload = MarketingSelloutUpload::create(['marketing_event_id' => $p->id, 'filename' => 'x.csv', 'status' => $status, 'total_rows' => count($rows)]);
        MarketingSelloutRow::insert(array_map(fn ($r, $i) => [
            'upload_id' => $upload->id, 'row_no' => $i + 2, 'sale_date' => '2026-11-10', 'customer_code' => 'D1', 'salesperson_code' => 'S1',
            'part_num' => 'P1', 'qty' => $r[0], 'amount' => $r[1],
        ], $rows, array_keys($rows)));

        return $upload;
    }

    private function claim(MarketingEvent $p, array $over = [])
    {
        return $this->postJson('/api/v1/marketing/claims', $over + [
            'program_id' => $p->id, 'customer_id' => $this->distributor('D1')->id,
            'letter_received_date' => '2026-12-10', 'claimed_amount' => 12000,
        ]);
    }

    private function claimId(MarketingEvent $p, array $over = []): int
    {
        return $this->claim($p, $over)->assertStatus(201)->json('data.id');
    }

    public function test_the_entry_options_list_only_approved_claim_programs_and_their_participants(): void
    {
        $approved = $this->program();
        $this->program(['reference_letter_no' => 'SKP/PENDING', 'budget_amount' => 1000], false);
        $this->actAs($this->user('supervisor'));

        $r = $this->getJson('/api/v1/marketing/claims/options')->assertOk();
        $this->assertSame([$approved->id], array_column($r->json('data.programs'), 'id'));
        $this->assertSame('2026-12-15', $r->json('data.programs.0.claim_deadline'));
        $this->assertSame([], $r->json('data.participants'));

        $withProgram = $this->getJson("/api/v1/marketing/claims/options?program_id={$approved->id}")->assertOk();
        $this->assertEqualsCanonicalizing(['D1', 'D2'], array_column($withProgram->json('data.participants'), 'customer_code'));

        $search = $this->getJson("/api/v1/marketing/claims/options?program_id={$approved->id}&q=D2")->assertOk();
        $this->assertSame(['D2'], array_column($search->json('data.participants'), 'customer_code'));
    }

    public function test_an_on_time_claim_starts_as_draft_with_a_number_and_its_documents(): void
    {
        Storage::fake('public');
        $p = $this->program();

        $r = $this->claim($p, [
            'letters' => [UploadedFile::fake()->create('surat.pdf', 50, 'application/pdf')],
            'worksheets' => [UploadedFile::fake()->create('kertas-kerja.pdf', 50, 'application/pdf')],
        ])->assertStatus(201);

        $this->assertSame('DRAFT', $r->json('data.status'));
        $this->assertFalse($r->json('data.is_late'));
        $this->assertMatchesRegularExpression('/^CLM-'.now()->format('Y').'-00001$/', $r->json('data.claim_no'));
        $this->assertSame('D1', $r->json('data.customer.customer_code'));
        $this->assertSame(12000.0, (float) $r->json('data.claimed_amount'));
        $this->assertEqualsCanonicalizing(['LETTER', 'WORKSHEET'], array_column($r->json('data.attachments'), 'kind'));
        Storage::disk('public')->assertExists($r->json('data.attachments.0.path'));
    }

    public function test_a_claim_received_after_the_claim_deadline_is_pending_but_not_rejected(): void
    {
        $p = $this->program();

        $late = $this->claim($p, ['letter_received_date' => '2026-12-16'])->assertStatus(201);
        $this->assertSame('PENDING_PASS', $late->json('data.status'));
        $this->assertTrue($late->json('data.is_late'));

        $onDeadline = $this->claim($p, ['letter_received_date' => '2026-12-15'])->assertStatus(201);
        $this->assertSame('DRAFT', $onDeadline->json('data.status')); // tepat di batas masih tepat waktu
        $this->assertNotSame($late->json('data.claim_no'), $onDeadline->json('data.claim_no'));
    }

    public function test_the_entry_rules_are_enforced(): void
    {
        $p = $this->program();
        $pending = $this->program(['reference_letter_no' => 'SKP/PENDING', 'budget_amount' => 1000], false);
        $outsider = $this->distributor('OUT'); // dibuat setelah program: bukan peserta

        $this->claim($pending)->assertStatus(422);                                   // program belum Approved
        $this->claim($p, ['customer_id' => $outsider->id])->assertStatus(422);       // bukan peserta program
        $this->claim($p, ['claimed_amount' => 0])->assertStatus(422);
        $this->claim($p, ['letter_received_date' => null])->assertStatus(422);
        $this->claim($p, ['program_id' => 9999])->assertStatus(422);
        $this->assertSame(0, MarketingClaim::count());

        $event = $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => MarketingBudget::first()->id, 'description' => 'Bazaar', 'reference_letter_no' => 'SK/1', 'activity_type' => 'EVENT',
            'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 1000,
        ])->json('data.id');
        $this->claim($p, ['program_id' => $event])->assertStatus(422);               // event biasa bukan program klaim
    }

    public function test_direktur_sales_can_pass_a_late_claim_so_the_process_continues(): void
    {
        $p = $this->program();
        $id = $this->claimId($p, ['letter_received_date' => '2026-12-20']);
        $admin = $this->user('admin', ['name' => 'Pak Direktur']);
        $this->actAs($admin);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/pass", ['reason_code' => 'SESUAI_STRATEGI', 'notes' => 'Kendala pengiriman'])->assertOk();

        $this->assertSame('DRAFT', $r->json('data.status'));
        $this->assertSame('PASSED', $r->json('data.pass_decision'));
        $this->assertSame('Pak Direktur', $r->json('data.passer.name'));
        $this->assertSame('SESUAI_STRATEGI', $r->json('data.pass_reason_code'));
        $this->assertTrue($r->json('data.is_late')); // tetap tercatat terlambat
    }

    public function test_refusing_a_late_claim_stops_the_process(): void
    {
        $p = $this->program();
        $this->sellOut($p, [[1, 400000]]);
        $id = $this->claimId($p, ['letter_received_date' => '2026-12-20']);
        $this->actAs($this->user('admin'));

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/refuse", ['reason_code' => 'DOKUMEN_KURANG'])->assertOk();

        $this->assertSame('STOPPED', $r->json('data.status'));
        $this->assertSame('REFUSED', $r->json('data.pass_decision'));
        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertStatus(422); // proses berhenti
        $this->postJson("/api/v1/marketing/claims/{$id}/pass", ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(422);
    }

    public function test_only_direktur_sales_decides_and_the_reason_code_must_match_the_decision(): void
    {
        $p = $this->program();
        $id = $this->claimId($p, ['letter_received_date' => '2026-12-20']);

        $this->actAs($this->user('supervisor'));
        $this->postJson("/api/v1/marketing/claims/{$id}/pass", ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(403);
        $this->postJson("/api/v1/marketing/claims/{$id}/refuse", ['reason_code' => 'DOKUMEN_KURANG'])->assertStatus(403);

        $this->actAs($this->user('admin'));
        $this->postJson("/api/v1/marketing/claims/{$id}/pass", [])->assertStatus(422);
        $this->postJson("/api/v1/marketing/claims/{$id}/pass", ['reason_code' => 'DOKUMEN_KURANG'])->assertStatus(422);   // kode tolak untuk pass
        $this->postJson("/api/v1/marketing/claims/{$id}/refuse", ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(422); // kode setuju untuk tolak
        $this->assertSame('PENDING_PASS', MarketingClaim::find($id)->status);
    }

    public function test_a_claim_that_is_not_late_has_nothing_to_pass(): void
    {
        $p = $this->program();
        $id = $this->claimId($p);
        $this->actAs($this->user('admin'));

        $this->postJson("/api/v1/marketing/claims/{$id}/pass", ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(422);
    }

    public function test_the_pass_authority_can_be_assigned_to_other_roles_or_emails(): void
    {
        config(['marketing.claim_submission.late_pass.emails' => ['Sales.Boss@Example.Test']]);
        $p = $this->program();
        $id = $this->claimId($p, ['letter_received_date' => '2026-12-20']);

        $this->actAs($this->user('supervisor', ['email' => 'sales.boss@example.test']));
        $this->postJson("/api/v1/marketing/claims/{$id}/pass", ['reason_code' => 'SESUAI_ANGGARAN'])->assertOk();
    }

    public function test_calculate_from_sell_out_uses_the_program_parameters(): void
    {
        $p = $this->program(); // 2,5% dari nilai penjualan
        $upload = $this->sellOut($p, [[5, 250000], [3, 150000]]);
        $id = $this->claimId($p, ['claimed_amount' => 12000]);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();

        $this->assertSame('CALCULATED', $r->json('data.status'));
        $this->assertEquals(10000, $r->json('data.eligible_amount'));
        $this->assertEquals(2000, $r->json('data.difference_amount')); // nilai pengajuan dikurangi nilai eligible
        $this->assertSame('SELL_OUT', $r->json('data.calc_detail.source'));
        $this->assertSame($upload->id, $r->json('data.calc_detail.upload_id'));
        $this->assertEquals(400000, $r->json('data.calc_detail.base_value'));
        $this->assertTrue($r->json('data.calc_detail.threshold_met'));
        $this->assertSame('2,5% x Rp 400.000 = Rp 10.000', $r->json('data.calc_detail.formula'));
        $this->assertNotNull($r->json('data.calculated_at'));
    }

    public function test_the_difference_is_negative_when_the_distributor_claimed_less_than_eligible(): void
    {
        $p = $this->program();
        $this->sellOut($p, [[1, 400000]]);
        $id = $this->claimId($p, ['claimed_amount' => 7000]);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();

        $this->assertEquals(-3000, $r->json('data.difference_amount'));
    }

    public function test_an_unmet_threshold_gives_zero_eligible(): void
    {
        $p = $this->program(['claim_threshold' => 5000000]);
        $this->sellOut($p, [[1, 400000]]);
        $id = $this->claimId($p, ['claimed_amount' => 12000]);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();

        $this->assertEquals(0, $r->json('data.eligible_amount'));
        $this->assertEquals(12000, $r->json('data.difference_amount'));
        $this->assertFalse($r->json('data.calc_detail.threshold_met'));
        $this->assertStringContainsString('Ambang belum tercapai', $r->json('data.calc_detail.formula'));
    }

    public function test_a_nominal_rate_with_the_quantity_basis_multiplies_by_the_quantity(): void
    {
        $p = $this->program(['claim_basis' => 'QUANTITY', 'claim_rate_type' => 'AMOUNT', 'claim_rate' => 500]);
        $this->sellOut($p, [[5, null], [3, null]]);
        $id = $this->claimId($p, ['claimed_amount' => 5000]);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();

        $this->assertEquals(4000, $r->json('data.eligible_amount')); // Rp 500 x 8
        $this->assertEquals(1000, $r->json('data.difference_amount'));
    }

    public function test_a_nominal_rate_with_the_sales_value_basis_is_a_fixed_amount(): void
    {
        $p = $this->program(['claim_rate_type' => 'AMOUNT', 'claim_rate' => 120000, 'claim_threshold' => 100000]);
        $this->sellOut($p, [[1, 400000]]);
        $id = $this->claimId($p, ['claimed_amount' => 150000]);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();

        $this->assertEquals(120000, $r->json('data.eligible_amount'));
        $this->assertEquals(30000, $r->json('data.difference_amount'));
    }

    public function test_calculate_is_blocked_until_the_sell_out_data_is_valid(): void
    {
        $p = $this->program();
        $id = $this->claimId($p);

        $detail = $this->getJson("/api/v1/marketing/claims/{$id}")->assertOk();
        $this->assertFalse($detail->json('data.flags.can_calculate'));
        $this->assertStringContainsString('Data sell out belum divalidasi', $detail->json('data.flags.calculate_blocker'));
        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertStatus(422);

        $this->sellOut($p, [[1, 400000]], 'REJECTED'); // berkas ditolak tidak dihitung
        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertStatus(422);

        $this->sellOut($p, [[1, 400000]]);
        $this->assertTrue($this->getJson("/api/v1/marketing/claims/{$id}")->json('data.flags.can_calculate'));
        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();
        $this->assertSame('CALCULATED', MarketingClaim::find($id)->status);
    }

    public function test_a_pending_late_claim_cannot_be_calculated_until_it_is_passed(): void
    {
        $p = $this->program();
        $this->sellOut($p, [[1, 400000]]);
        $id = $this->claimId($p, ['letter_received_date' => '2026-12-20']);

        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertStatus(422);
        $this->assertFalse($this->getJson("/api/v1/marketing/claims/{$id}")->json('data.flags.can_calculate'));

        $this->actAs($this->user('admin'));
        $this->postJson("/api/v1/marketing/claims/{$id}/pass", ['reason_code' => 'SESUAI_ANGGARAN'])->assertOk();
        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();
    }

    public function test_recalculating_uses_the_newest_valid_sell_out_data(): void
    {
        $p = $this->program();
        $this->sellOut($p, [[1, 400000]]);
        $id = $this->claimId($p, ['claimed_amount' => 12000]);
        $this->assertEquals(10000, $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->json('data.eligible_amount'));

        MarketingSelloutUpload::where('marketing_event_id', $p->id)->update(['status' => 'SUPERSEDED']);
        $this->sellOut($p, [[1, 800000]]);

        $this->assertEquals(20000, $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->json('data.eligible_amount'));
    }

    public function test_calculate_from_sell_in_reads_the_distributors_invoices_in_the_program_period(): void
    {
        Schema::create('tmp_invoices', function ($t) {
            $t->id();
            $t->unsignedBigInteger('customer_id');
            $t->date('invoice_date');
            $t->decimal('total', 15, 2);
        });
        Schema::create('tmp_invoice_lines', function ($t) {
            $t->id();
            $t->unsignedBigInteger('invoice_id');
            $t->decimal('qty', 15, 3);
        });
        config(['marketing.sellin' => [
            'table' => 'tmp_invoices', 'customer_columns' => ['customer_id'], 'date_columns' => ['invoice_date'], 'amount_columns' => ['total'],
            'lines_table' => 'tmp_invoice_lines', 'lines_invoice_columns' => ['invoice_id'], 'lines_qty_columns' => ['qty'],
        ]]);

        $p = $this->program(['claim_source' => 'SELL_IN']);
        $d1 = $this->distributor('D1')->id;
        $d2 = $this->distributor('D2')->id;
        $inPeriodA = DB::table('tmp_invoices')->insertGetId(['customer_id' => $d1, 'invoice_date' => '2026-11-05', 'total' => 100000]);
        $inPeriodB = DB::table('tmp_invoices')->insertGetId(['customer_id' => $d1, 'invoice_date' => '2026-11-30', 'total' => 300000]); // batas akhir ikut
        $outside = DB::table('tmp_invoices')->insertGetId(['customer_id' => $d1, 'invoice_date' => '2026-12-05', 'total' => 999999]);
        $other = DB::table('tmp_invoices')->insertGetId(['customer_id' => $d2, 'invoice_date' => '2026-11-10', 'total' => 50000]);
        DB::table('tmp_invoice_lines')->insert([
            ['invoice_id' => $inPeriodA, 'qty' => 4], ['invoice_id' => $inPeriodB, 'qty' => 6], ['invoice_id' => $outside, 'qty' => 100], ['invoice_id' => $other, 'qty' => 50],
        ]);
        $id = $this->claimId($p, ['claimed_amount' => 12000]);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk(); // tanpa upload sell out
        $this->assertSame('SELL_IN', $r->json('data.calc_detail.source'));
        $this->assertSame(2, $r->json('data.calc_detail.invoice_count'));
        $this->assertEquals(400000, $r->json('data.calc_detail.base_value'));
        $this->assertEquals(10000, $r->json('data.eligible_amount'));

        $q = $this->program(['claim_source' => 'SELL_IN', 'claim_basis' => 'QUANTITY', 'claim_rate_type' => 'AMOUNT', 'claim_rate' => 100, 'reference_letter_no' => 'SKP/QTY', 'budget_amount' => 1000]);
        $qid = $this->claimId($q, ['claimed_amount' => 2000]);
        $rq = $this->postJson("/api/v1/marketing/claims/{$qid}/calculate")->assertOk();
        $this->assertEquals(10, $rq->json('data.calc_detail.base_value')); // 4 + 6 unit
        $this->assertEquals(1000, $rq->json('data.eligible_amount'));
    }

    public function test_sell_in_stops_with_a_clear_message_when_the_invoice_table_is_not_recognised(): void
    {
        config(['marketing.sellin.table' => 'tabel_tidak_ada']);
        $p = $this->program(['claim_source' => 'SELL_IN']);
        $id = $this->claimId($p);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertStatus(422);

        $this->assertStringContainsString('tidak ditemukan', $r->json('message'));
        $this->assertSame('DRAFT', MarketingClaim::find($id)->status);
        $this->assertNull(MarketingClaim::find($id)->eligible_amount);

        config(['marketing.sellin' => ['table' => 'users', 'customer_columns' => ['nope'], 'date_columns' => ['nope'], 'amount_columns' => ['nope'],
            'lines_table' => 'users', 'lines_invoice_columns' => ['nope'], 'lines_qty_columns' => ['nope']]]);
        $r2 = $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertStatus(422);
        $this->assertStringContainsString('Kolom AR Invoice tidak dikenali', $r2->json('message'));
    }

    public function test_the_payout_method_is_chosen_and_the_claim_is_forwarded_to_approval(): void
    {
        $p = $this->program();
        $this->sellOut($p, [[1, 400000]]);
        $id = $this->claimId($p);

        $this->postJson("/api/v1/marketing/claims/{$id}/submit", ['payout_method' => 'TRANSFER'])->assertStatus(422); // belum dihitung

        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertOk();
        $this->postJson("/api/v1/marketing/claims/{$id}/submit", ['payout_method' => 'EMAS'])->assertStatus(422);       // metode tidak dikenal
        $this->postJson("/api/v1/marketing/claims/{$id}/submit", [])->assertStatus(422);

        $r = $this->postJson("/api/v1/marketing/claims/{$id}/submit", ['payout_method' => 'POTONG_NOTA'])->assertOk();
        $this->assertSame('SUBMITTED', $r->json('data.status'));
        $this->assertSame('POTONG_NOTA', $r->json('data.payout_method'));
        $this->assertSame('Potong Nota', $r->json('data.payout_method_label'));
        $this->assertNotNull($r->json('data.submitted_at'));
        $this->assertNull($r->json('data.approved_amount')); // diisi oleh approval pada tahap berikutnya

        $this->postJson("/api/v1/marketing/claims/{$id}/submit", ['payout_method' => 'TRANSFER'])->assertStatus(422);  // tidak bisa diajukan dua kali
        $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertStatus(422);                                // setelah diajukan tidak bisa dihitung ulang
    }

    public function test_the_list_flags_which_claims_wait_for_my_pass_and_can_be_filtered(): void
    {
        $p = $this->program();
        $this->claimId($p);
        $this->claimId($p, ['letter_received_date' => '2026-12-20']);

        $this->actAs($this->user('admin'));
        $mine = $this->getJson('/api/v1/marketing/claims')->assertOk();
        $byStatus = collect($mine->json('data'))->pluck('can_pass', 'status')->all();
        $this->assertTrue($byStatus['PENDING_PASS']);
        $this->assertFalse($byStatus['DRAFT']);

        $this->actAs($this->user('supervisor'));
        $this->assertFalse(collect($this->getJson('/api/v1/marketing/claims')->json('data'))->pluck('can_pass', 'status')->all()['PENDING_PASS']);

        $pending = $this->getJson('/api/v1/marketing/claims?status=PENDING_PASS')->assertOk();
        $this->assertCount(1, $pending->json('data'));
        $this->assertSame('D1', $pending->json('data.0.customer.customer_code'));
    }

    public function test_the_detail_includes_the_program_summary_and_the_choices(): void
    {
        $p = $this->program();
        $id = $this->claimId($p);
        $this->actAs($this->user('supervisor'));

        $r = $this->getJson("/api/v1/marketing/claims/{$id}")->assertOk();

        $this->assertSame($p->event_code, $r->json('data.program.event_code'));
        $this->assertSame('SELL_OUT', $r->json('data.program.claim_source'));
        $this->assertSame(['POTONG_NOTA', 'POTONG_TAGIHAN', 'TRANSFER', 'BARANG'], array_column($r->json('data.flags.payout_methods'), 'value'));
        $this->assertSame('Direktur Sales', $r->json('data.flags.pass_label'));
        $this->assertNotEmpty($r->json('data.flags.reason_codes.APPROVE'));
        $this->assertNotEmpty($r->json('data.flags.reason_codes.REJECT'));
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        $p = $this->program();
        $this->sellOut($p, [[1, 400000]]);
        $late = $this->claimId($p, ['letter_received_date' => '2026-12-20']);
        $this->actAs($this->user('admin'));
        $this->postJson("/api/v1/marketing/claims/{$late}/pass", ['reason_code' => 'SESUAI_ANGGARAN'])->assertOk();
        $this->postJson("/api/v1/marketing/claims/{$late}/calculate")->assertOk();
        $this->postJson("/api/v1/marketing/claims/{$late}/submit", ['payout_method' => 'BARANG'])->assertOk();
        $other = $this->claimId($p, ['letter_received_date' => '2026-12-21']);
        $this->postJson("/api/v1/marketing/claims/{$other}/refuse", ['reason_code' => 'LAINNYA'])->assertOk();

        foreach (['create', 'pass', 'calculate', 'submit'] as $step) {
            $this->assertTrue(AuditLog::where('action', "marketing_claim.{$step}")->where('entity_id', $late)->exists(), $step);
        }
        $this->assertTrue(AuditLog::where('action', 'marketing_claim.refuse')->where('entity_id', $other)->exists());
    }

    public function test_sales_and_other_roles_cannot_use_the_claim_endpoints(): void
    {
        $p = $this->program();
        $id = $this->claimId($p);

        foreach (['sales', 'finance', 'warehouse'] as $role) {
            $this->actAs($this->user($role));
            $this->getJson('/api/v1/marketing/claims')->assertStatus(403);
            $this->getJson('/api/v1/marketing/claims/options')->assertStatus(403);
            $this->getJson("/api/v1/marketing/claims/{$id}")->assertStatus(403);
            $this->claim($p)->assertStatus(403);
            $this->postJson("/api/v1/marketing/claims/{$id}/calculate")->assertStatus(403);
            $this->postJson("/api/v1/marketing/claims/{$id}/submit", ['payout_method' => 'TRANSFER'])->assertStatus(403);
        }
        $this->assertSame(1, MarketingClaim::count());
    }

    public function test_unknown_claims_return_404_and_login_is_required(): void
    {
        $this->getJson('/api/v1/marketing/claims')->assertStatus(401);
        $this->postJson('/api/v1/marketing/claims', [])->assertStatus(401);

        $this->actAs($this->user('admin'));
        $this->getJson('/api/v1/marketing/claims/999')->assertStatus(404);
        $this->postJson('/api/v1/marketing/claims/999/calculate')->assertStatus(404);
        $this->postJson('/api/v1/marketing/claims/999/pass', ['reason_code' => 'SESUAI_ANGGARAN'])->assertStatus(404);
        $this->postJson('/api/v1/marketing/claims/999/submit', ['payout_method' => 'TRANSFER'])->assertStatus(404);
    }
}