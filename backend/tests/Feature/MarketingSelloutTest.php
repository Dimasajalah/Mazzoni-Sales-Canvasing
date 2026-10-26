<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingEvent;
use App\Models\MarketingSelloutRow;
use App\Models\MarketingSelloutUpload;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Blueprint MJU 3.2.7 / MKT07: Upload Data Sell Out (validasi per baris, semua atau tidak sama sekali). */
class MarketingSelloutTest extends TestCase
{
    use RefreshDatabase;

    private const HEADER = 'tanggal,kode_outlet,kode_salesman,kode_part,qty,nilai';

    private function user(string $role, array $attrs = []): User
    {
        return User::factory()->create(['role' => $role, 'active' => true] + $attrs);
    }

    private function actAs(User $u): void
    {
        Sanctum::actingAs($u);
    }

    /** Master yang dipakai validasi: customer C1 (dibuat bersama program), salesman SLS01, part P-001 dan P-002. */
    private function master(): void
    {
        $this->user('sales', ['salesperson_code' => 'SLS01']);
        foreach (['P-001', 'P-002'] as $part) {
            $columns = array_flip(Schema::getColumnListing('products'));
            DB::table('products')->insert(array_intersect_key([
                'part_num' => $part, 'epicor_part_num' => $part, 'description' => "Produk {$part}", 'name' => "Produk {$part}",
                'uom' => 'DUS', 'price' => 1000, 'created_at' => now(), 'updated_at' => now(),
            ], $columns));
        }
    }

    /** Program klaim bersumber Sell Out, periode 1-30 November 2026. Dibuat oleh admin. */
    private function program(string $source = 'SELL_OUT', string $basis = 'SALES_VALUE'): MarketingEvent
    {
        $this->actAs($this->user('admin'));
        $budget = MarketingBudget::first() ?? MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'Campaign Ramadan', 'fiscal_year' => 2026,
            'total_budget' => 100000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        if (! Customer::where('customer_code', 'C1')->exists()) {
            Customer::create(['customer_code' => 'C1', 'name' => 'Toko C1', 'active' => true]);
        }

        $id = $this->postJson('/api/v1/marketing/claim-programs', [
            'marketing_budget_id' => $budget->id, 'description' => 'Diskon Saus Q4', 'reference_letter_no' => 'SKP/'.uniqid(),
            'claim_type' => 'DISKON_PRODUK', 'claim_source' => $source, 'claim_basis' => $basis, 'claim_rate_type' => 'PERCENT',
            'claim_rate' => 2.5, 'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'claim_deadline' => '2026-12-15',
            'target_type' => 'NATIONAL', 'budget_amount' => 400000,
        ])->assertStatus(201)->json('data.id');

        return MarketingEvent::find($id);
    }

    private function csv(array $rows, string $header = self::HEADER): string
    {
        return implode("\n", array_merge([$header], $rows))."\n";
    }

    private function upload(int $id, string $content, string $name = 'sellout.csv')
    {
        return $this->postJson("/api/v1/marketing/claim-programs/{$id}/sellout", ['file' => UploadedFile::fake()->createWithContent($name, $content)]);
    }

    private function panel(int $id)
    {
        return $this->getJson("/api/v1/marketing/claim-programs/{$id}/sellout")->assertOk();
    }

    public function test_the_template_is_the_standard_header_named_after_the_program(): void
    {
        $p = $this->program();
        $this->actAs($this->user('supervisor'));

        $r = $this->getJson("/api/v1/marketing/claim-programs/{$p->id}/sellout/template")->assertOk();

        $this->assertSame(self::HEADER, trim($r->json('data.content')));
        $this->assertSame('template-sellout-BDG-2026-001-K01.csv', $r->json('data.filename'));
    }

    public function test_the_panel_is_enabled_only_for_sell_out_programs_and_lists_the_columns(): void
    {
        $p = $this->program();
        $this->actAs($this->user('supervisor'));

        $r = $this->panel($p->id);

        $this->assertTrue($r->json('data.enabled'));
        $this->assertSame(['start' => '2026-11-01', 'end' => '2026-11-30'], $r->json('data.period'));
        $this->assertSame(self::HEADER, implode(',', array_column($r->json('data.columns'), 'name')));
        $required = collect($r->json('data.columns'))->pluck('required', 'name')->all();
        $this->assertTrue($required['nilai']);
        $this->assertFalse($required['qty']); // basis Nilai Penjualan
        $this->assertNull($r->json('data.current'));
        $this->assertFalse($r->json('data.calculate_ready'));

        $in = $this->program('SELL_IN');
        $this->actAs($this->user('supervisor'));
        $this->assertFalse($this->panel($in->id)->json('data.enabled'));
    }

    public function test_the_required_number_column_follows_the_calculation_basis(): void
    {
        $p = $this->program('SELL_OUT', 'QUANTITY');
        $this->actAs($this->user('supervisor'));

        $required = collect($this->panel($p->id)->json('data.columns'))->pluck('required', 'name')->all();

        $this->assertTrue($required['qty']);
        $this->assertFalse($required['nilai']);
    }

    public function test_a_valid_file_is_accepted_stored_and_makes_the_program_ready(): void
    {
        $this->master();
        $p = $this->program();

        $r = $this->upload($p->id, $this->csv([
            '2026-11-10,C1,SLS01,P-001,5,250000',
            '2026-11-20,c1,sls01,p-002,,100000', // huruf kecil dan qty kosong diperbolehkan
        ]))->assertOk();

        $this->assertSame('VALID', $r->json('data.status'));
        $this->assertSame(2, $r->json('data.total_rows'));
        $this->assertSame(0, $r->json('data.error_count'));
        $this->assertEquals(350000, $r->json('data.total_amount'));
        $this->assertEquals(5, $r->json('data.total_qty'));
        $this->assertSame(2, MarketingSelloutRow::count());
        $this->assertSame(Customer::where('customer_code', 'C1')->value('id'), MarketingSelloutRow::first()->customer_id);

        $panel = $this->panel($p->id);
        $this->assertTrue($panel->json('data.calculate_ready'));
        $this->assertSame($r->json('data.id'), $panel->json('data.current.id'));
    }

    public function test_every_bad_row_is_reported_with_its_reason_and_nothing_is_stored(): void
    {
        $this->master();
        $p = $this->program();

        $r = $this->upload($p->id, $this->csv([
            '2026-10-31,C1,SLS01,P-001,1,1000',        // 2: di luar periode
            '2026-11-10,NOPE,SLS01,P-001,1,1000',      // 3: outlet tidak terdaftar
            '2026-11-10,C1,NOSLS,P-001,1,1000',        // 4: salesman tidak terdaftar
            '2026-11-10,C1,SLS01,NOPART,1,1000',       // 5: part tidak ada
            '10 November,C1,SLS01,P-001,1,1000',       // 6: format tanggal
            '2026-11-10,C1,SLS01,P-001,1,1.000.000',   // 7: angka salah
            '2026-11-10,C1,SLS01,P-001,1,',            // 8: nilai wajib
            '2026-11-10,C1,SLS01,P-001,1,0',           // 9: nilai harus > 0
            '2026-11-10,C1,SLS01,P-001,1,1000',        // 10: valid
        ]))->assertOk();

        $this->assertSame('REJECTED', $r->json('data.status'));
        $this->assertSame(9, $r->json('data.total_rows'));
        $this->assertSame(8, $r->json('data.error_count'));

        $errors = collect($r->json('data.errors'))->keyBy('row');
        $this->assertSame([2, 3, 4, 5, 6, 7, 8, 9], $errors->keys()->all());
        $this->assertSame('tanggal', $errors[2]['field']);
        $this->assertStringContainsString('di luar periode program', $errors[2]['message']);
        $this->assertSame(['kode_outlet', 'NOPE'], [$errors[3]['field'], $errors[3]['value']]);
        $this->assertStringContainsString('tidak terdaftar', $errors[3]['message']);
        $this->assertSame('kode_salesman', $errors[4]['field']);
        $this->assertSame('kode_part', $errors[5]['field']);
        $this->assertStringContainsString('Part Master', $errors[5]['message']);
        $this->assertStringContainsString('Format tanggal', $errors[6]['message']);
        $this->assertSame('nilai', $errors[7]['field']);
        $this->assertStringContainsString('wajib diisi', $errors[8]['message']);
        $this->assertStringContainsString('lebih dari 0', $errors[9]['message']);

        $this->assertSame(0, MarketingSelloutRow::count());
        $this->assertSame('REJECTED', MarketingSelloutUpload::first()->status);
        $this->assertFalse($this->panel($p->id)->json('data.calculate_ready'));
    }

    public function test_a_file_without_the_required_columns_is_rejected_with_a_header_message(): void
    {
        $this->master();
        $p = $this->program();

        $r = $this->upload($p->id, "tanggal,kode_outlet,kode_part,nilai\n2026-11-10,C1,P-001,1000\n")->assertOk();

        $this->assertSame('REJECTED', $r->json('data.status'));
        $this->assertSame('header', $r->json('data.errors.0.field'));
        $this->assertStringContainsString('kode_salesman', $r->json('data.errors.0.message'));
        $this->assertSame(0, MarketingSelloutRow::count());
    }

    public function test_a_file_with_only_a_header_is_rejected(): void
    {
        $this->master();
        $p = $this->program();

        $r = $this->upload($p->id, self::HEADER."\n")->assertOk();

        $this->assertSame('REJECTED', $r->json('data.status'));
        $this->assertStringContainsString('tidak berisi baris data', $r->json('data.errors.0.message'));
    }

    public function test_with_the_quantity_basis_qty_is_required_and_value_is_optional(): void
    {
        $this->master();
        $p = $this->program('SELL_OUT', 'QUANTITY');

        $ok = $this->upload($p->id, $this->csv(['2026-11-10,C1,SLS01,P-001,5,']))->assertOk();
        $this->assertSame('VALID', $ok->json('data.status'));

        $bad = $this->upload($p->id, $this->csv(['2026-11-11,C1,SLS01,P-001,,1000']))->assertOk();
        $this->assertSame('REJECTED', $bad->json('data.status'));
        $this->assertSame('qty', $bad->json('data.errors.0.field'));
    }

    public function test_a_fixed_file_can_be_uploaded_again_and_a_newer_valid_file_replaces_the_older_one(): void
    {
        $this->master();
        $p = $this->program();
        $good = $this->csv(['2026-11-10,C1,SLS01,P-001,5,250000']);

        $this->upload($p->id, $this->csv(['2026-11-10,NOPE,SLS01,P-001,5,250000']))->assertOk(); // ditolak
        $first = $this->upload($p->id, $good)->assertOk()->json('data.id');
        $second = $this->upload($p->id, $this->csv(['2026-11-12,C1,SLS01,P-002,7,300000']))->assertOk()->json('data.id');

        $this->assertSame(['REJECTED', 'SUPERSEDED', 'VALID'], MarketingSelloutUpload::orderBy('id')->pluck('status')->all());
        $panel = $this->panel($p->id);
        $this->assertSame($second, $panel->json('data.current.id'));
        $this->assertCount(3, $panel->json('data.history'));
        $this->assertNotSame($first, $panel->json('data.current.id'));
    }

    public function test_a_rejected_upload_does_not_remove_the_valid_data_already_accepted(): void
    {
        $this->master();
        $p = $this->program();
        $valid = $this->upload($p->id, $this->csv(['2026-11-10,C1,SLS01,P-001,5,250000']))->assertOk()->json('data.id');

        $this->upload($p->id, $this->csv(['2026-11-10,NOPE,SLS01,P-001,5,250000']))->assertOk();

        $panel = $this->panel($p->id);
        $this->assertSame($valid, $panel->json('data.current.id'));
        $this->assertTrue($panel->json('data.calculate_ready'));
        $this->assertSame('REJECTED', $panel->json('data.latest.status'));
        $this->assertSame('kode_outlet', $panel->json('data.latest.errors.0.field'));
        $this->assertSame(1, MarketingSelloutRow::count());
    }

    public function test_semicolons_a_bom_and_loose_header_names_are_accepted(): void
    {
        $this->master();
        $p = $this->program();

        $r = $this->upload($p->id, "\xEF\xBB\xBFTanggal;Kode Outlet;Kode Salesman;Kode Part;Qty;Nilai\r\n2026-11-10;C1;SLS01;P-001;2;50000\r\n")->assertOk();

        $this->assertSame('VALID', $r->json('data.status'));
        $this->assertSame(1, MarketingSelloutRow::count());
    }

    public function test_blank_rows_are_skipped_and_row_numbers_follow_the_file(): void
    {
        $this->master();
        $p = $this->program();

        $r = $this->upload($p->id, self::HEADER."\n\n2026-11-10,C1,SLS01,P-001,5,250000\n,,,,,\n2026-11-11,NOPE,SLS01,P-001,5,250000\n")->assertOk();

        $this->assertSame(2, $r->json('data.total_rows'));
        $this->assertSame(5, $r->json('data.errors.0.row')); // baris ke-5 di berkas
    }

    public function test_the_row_limit_comes_from_the_config(): void
    {
        $this->master();
        $p = $this->program();
        config(['marketing.sellout.max_rows' => 2]);

        $this->upload($p->id, $this->csv(array_fill(0, 3, '2026-11-10,C1,SLS01,P-001,5,250000')))->assertStatus(422);
        $this->assertSame(0, MarketingSelloutUpload::count());
    }

    public function test_only_csv_files_are_accepted(): void
    {
        $this->master();
        $p = $this->program();

        $this->upload($p->id, 'bukan csv', 'sellout.xlsx')->assertStatus(422);
        $this->assertSame(0, MarketingSelloutUpload::count());
    }

    public function test_a_sell_in_program_cannot_take_sell_out_data(): void
    {
        $this->master();
        $p = $this->program('SELL_IN');

        $this->upload($p->id, $this->csv(['2026-11-10,C1,SLS01,P-001,5,250000']))->assertStatus(422);
        $this->assertSame(0, MarketingSelloutUpload::count());
    }

    public function test_an_ordinary_event_has_no_sell_out_panel(): void
    {
        $this->actAs($this->user('admin'));
        $budget = MarketingBudget::create([
            'campaign_code' => 'BDG-2026-001', 'name' => 'C', 'fiscal_year' => 2026, 'total_budget' => 1000000, 'allocated_amount' => 0, 'status' => 'ACTIVE',
        ]);
        Customer::create(['customer_code' => 'C1', 'name' => 'Toko C1', 'active' => true]);
        $eventId = $this->postJson('/api/v1/marketing/events', [
            'marketing_budget_id' => $budget->id, 'description' => 'Bazaar', 'reference_letter_no' => 'SK/1', 'activity_type' => 'EVENT',
            'start_date' => '2026-11-01', 'end_date' => '2026-11-30', 'target_type' => 'NATIONAL', 'budget_amount' => 1000,
        ])->json('data.id');

        $this->getJson("/api/v1/marketing/claim-programs/{$eventId}/sellout")->assertStatus(404);
        $this->getJson("/api/v1/marketing/claim-programs/{$eventId}/sellout/template")->assertStatus(404);
        $this->getJson('/api/v1/marketing/claim-programs/999/sellout')->assertStatus(404);
    }

    public function test_uploads_are_written_to_the_audit_log(): void
    {
        $this->master();
        $p = $this->program();
        $this->upload($p->id, $this->csv(['2026-11-10,C1,SLS01,P-001,5,250000']))->assertOk();
        $this->upload($p->id, $this->csv(['2026-11-10,NOPE,SLS01,P-001,5,250000']))->assertOk();

        $this->assertSame(2, AuditLog::where('action', 'marketing_sellout.upload')->where('entity_id', $p->id)->count());
    }

    public function test_sales_cannot_use_the_sell_out_endpoints_and_login_is_required(): void
    {
        $this->master();
        $p = $this->program();

        $this->actAs($this->user('sales'));
        $this->getJson("/api/v1/marketing/claim-programs/{$p->id}/sellout")->assertStatus(403);
        $this->getJson("/api/v1/marketing/claim-programs/{$p->id}/sellout/template")->assertStatus(403);
        $this->upload($p->id, $this->csv(['2026-11-10,C1,SLS01,P-001,5,250000']))->assertStatus(403);
        $this->assertSame(0, MarketingSelloutUpload::count());
    }

    public function test_the_sell_out_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/marketing/claim-programs/1/sellout')->assertStatus(401);
        $this->getJson('/api/v1/marketing/claim-programs/1/sellout/template')->assertStatus(401);
        $this->postJson('/api/v1/marketing/claim-programs/1/sellout', [])->assertStatus(401);
    }
}