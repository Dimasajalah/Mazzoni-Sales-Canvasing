<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\DiscountStratum;
use App\Models\Lead;
use App\Models\Product;
use App\Models\ProductPackaging;
use App\Models\Quote;
use App\Models\SalesOrder;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use App\Services\PackagingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Konversi Kg -> pcs, strata, Quotation, konversi ke order, dan master data. */
class QuotationTest extends TestCase
{
    use RefreshDatabase;

    private function loginAs(string $role = 'sales'): User
    {
        $user = User::factory()->create(['role' => $role, 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function product(float $price = 28500, string $name = 'Saus Tomat 1kg'): Product
    {
        return Product::create([
            'part_num' => 'P-'.uniqid(), 'description' => $name, 'uom' => 'PCS', 'price' => $price,
            // Poin 18: produk "normal" di tes dianggap sudah teregister (epicor_part_num terisi);
            // skenario belum teregister diuji sendiri di ProductRegistrationTest.
            'epicor_part_num' => 'EP-'.uniqid(), 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    private function packaging(Product $p, float $gram = 500): ProductPackaging
    {
        return ProductPackaging::create(['product_id' => $p->id, 'name' => "Pouch {$gram} gr", 'gramasi_gr' => $gram]);
    }

    private function customer(User $owner, string $code = 'C-Q-1'): Customer
    {
        return Customer::create([
            'customer_code' => $code, 'name' => 'PT '.$code, 'city' => 'Surabaya',
            'salesperson_id' => $owner->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    private function lead(array $extra = []): array
    {
        return $this->postJson('/api/v1/leads', array_merge([
            'business_name' => 'UD Penawaran', 'ktp' => '3578010101900001',
            'task_set_id' => TaskSet::where('code', 'B2B')->firstOrFail()->id,
        ], $extra))->assertCreated()->json('data');
    }

    private function template(int $seq): TaskTemplate
    {
        return TaskTemplate::where('seq', $seq)
            ->where('task_set_id', TaskSet::where('code', 'B2B')->firstOrFail()->id)->firstOrFail();
    }

    // ---------------------------------------------------------------- konversi

    public function test_kg_to_pcs_conversion_and_rounding_modes(): void
    {
        $svc = app(PackagingService::class);

        $this->assertSame(50, $svc->kgToPcs(1, 20));
        $this->assertSame(5000, $svc->kgToPcs(100, 20));
        // Presisi floating point: perhitungan naif ceil(Kg x 1000 / gramasi) meleset satu pcs pada kombinasi ini
        // (mis. 4,03 x 1000 / 10 = 403,00000000000006 -> naif 404). Nilai yang benar adalah 403.
        $this->assertSame(403, $svc->kgToPcs(4.03, 10));
        $this->assertSame(161, $svc->kgToPcs(8.05, 50));
        $this->assertSame(322, $svc->kgToPcs(8.05, 25));

        $this->assertSame(3, $svc->kgToPcs(1.05, 500));          // 2,1 -> ke atas (default)
        config(['canvassing.pcs_rounding' => 'floor']);
        $this->assertSame(2, $svc->kgToPcs(1.05, 500));
        config(['canvassing.pcs_rounding' => 'round']);
        $this->assertSame(2, $svc->kgToPcs(1.05, 500));
        config(['canvassing.pcs_rounding' => 'floor']);
        $this->assertSame(1, $svc->kgToPcs(0.1, 500));           // minimal 1 pcs

        $this->expectException(\InvalidArgumentException::class);
        $svc->kgToPcs(1, 0);
    }

    public function test_strata_lookup_prefers_product_specific_tier_and_respects_bounds(): void
    {
        $svc = app(PackagingService::class);
        $p = $this->product();

        $this->assertSame(0.0, $svc->strataPercent($p->id, 500)); // tabel kosong

        DiscountStratum::create(['min_kg' => 100, 'max_kg' => 499.999, 'discount_percent' => 2]);
        DiscountStratum::create(['min_kg' => 500, 'max_kg' => null, 'discount_percent' => 4]);
        DiscountStratum::create(['product_id' => $p->id, 'min_kg' => 500, 'discount_percent' => 6]);
        DiscountStratum::create(['min_kg' => 50, 'max_kg' => null, 'discount_percent' => 9, 'active' => false]);

        $this->assertSame(0.0, $svc->strataPercent($p->id, 99.9));
        $this->assertSame(2.0, $svc->strataPercent($p->id, 100));
        $this->assertSame(2.0, $svc->strataPercent($p->id, 499));
        $this->assertSame(6.0, $svc->strataPercent($p->id, 500));                    // tier produk mengalahkan umum
        $this->assertSame(4.0, $svc->strataPercent($this->product()->id, 500));       // produk lain -> tier umum
        $this->assertSame(4.0, $svc->strataPercent(null, 5000));
    }

    // ---------------------------------------------------------------- penawaran

    public function test_quote_lines_are_computed_from_kg_with_strata_and_manual_discount(): void
    {
        $this->loginAs();
        $p = $this->product(28500);
        $pk = $this->packaging($p, 500);
        DiscountStratum::create(['min_kg' => 100, 'max_kg' => 499, 'discount_percent' => 2]);

        $res = $this->postJson('/api/v1/quotes', [
            'terms' => 'Pembayaran 14 hari',
            'lines' => [['product_id' => $p->id, 'packaging_id' => $pk->id, 'qty_kg' => 100, 'disc1_percent' => 1]],
        ])->assertCreated();

        // Poin 15: bertingkat, bukan dijumlah -> 1 - (1-2%)(1-1%) = 2,98% (bukan 3%)
        $res->assertJsonPath('data.status', 'DRAFT')
            ->assertJsonPath('data.terms', 'Pembayaran 14 hari')
            ->assertJsonPath('data.lines.0.qty_pcs', 200)            // 100 kg x 1000 / 500 gr
            ->assertJsonPath('data.lines.0.strata_percent', '2.00')
            ->assertJsonPath('data.lines.0.disc1_percent', '1.00')
            ->assertJsonPath('data.lines.0.gramasi_gr', '500.00')
            ->assertJsonPath('data.subtotal', '5700000.00')          // 200 x 28.500
            ->assertJsonPath('data.discount_total', '169860.00')     // 2,98% bertingkat (strata 2% lalu Disc1 1%)
            ->assertJsonPath('data.total', '5530140.00');

        $this->assertMatchesRegularExpression('/^QT-STG-\d{4}-000001$/', $res->json('data.quote_number'));
    }

    public function test_line_validation_rules(): void
    {
        $this->loginAs();
        $p = $this->product();
        $other = $this->product(1000, 'Produk Lain');
        $foreign = $this->packaging($other, 250);

        $this->postJson('/api/v1/quotes', ['lines' => [['product_id' => $p->id]]])
            ->assertStatus(422)->assertJsonValidationErrors('lines.0.qty_kg');

        // tanpa kemasan dan tanpa gramasi
        $this->postJson('/api/v1/quotes', ['lines' => [['product_id' => $p->id, 'qty_kg' => 5]]])
            ->assertStatus(422)->assertJsonValidationErrors('lines.0.gramasi_gr');

        // kemasan milik produk lain
        $this->postJson('/api/v1/quotes', ['lines' => [['product_id' => $p->id, 'packaging_id' => $foreign->id, 'qty_kg' => 5]]])
            ->assertStatus(422)->assertJsonValidationErrors('lines.0.packaging_id');

        $this->postJson('/api/v1/quotes', ['lines' => [['product_id' => $p->id, 'gramasi_gr' => 20, 'qty_kg' => 5, 'disc1_percent' => 150]]])
            ->assertStatus(422)->assertJsonValidationErrors('lines.0.disc1_percent');

        $this->assertSame(0, Quote::count()); // penolakan tidak meninggalkan penawaran setengah jadi
    }

    public function test_manual_gramasi_without_packaging_and_custom_price(): void
    {
        $this->loginAs();
        $p = $this->product(1000);

        $this->postJson('/api/v1/quotes', ['lines' => [
            ['product_id' => $p->id, 'gramasi_gr' => 20, 'qty_kg' => 2, 'unit_price' => 900],
        ]])->assertCreated()
            ->assertJsonPath('data.lines.0.qty_pcs', 100)
            ->assertJsonPath('data.lines.0.unit_price', '900.00')
            ->assertJsonPath('data.total', '90000.00');
    }

    public function test_replace_lines_recalculates_and_quoted_flow(): void
    {
        $this->loginAs();
        $p = $this->product(1000);
        $id = $this->postJson('/api/v1/quotes', [])->assertCreated()->json('data.id');

        // belum ada baris -> tidak bisa ditandai Quoted
        $this->postJson("/api/v1/quotes/{$id}/mark-quoted")->assertStatus(422);

        $this->putJson("/api/v1/quotes/{$id}/lines", ['lines' => [
            ['product_id' => $p->id, 'gramasi_gr' => 100, 'qty_kg' => 10],
        ]])->assertOk()->assertJsonPath('data.total', '100000.00');

        $this->putJson("/api/v1/quotes/{$id}/lines", ['lines' => [
            ['product_id' => $p->id, 'gramasi_gr' => 100, 'qty_kg' => 20],
        ]])->assertOk()->assertJsonCount(1, 'data.lines')->assertJsonPath('data.total', '200000.00');

        $this->postJson("/api/v1/quotes/{$id}/mark-quoted")->assertOk()
            ->assertJsonPath('data.status', 'QUOTED')->assertJsonPath('data.quoted', true);

        $this->patchJson("/api/v1/quotes/{$id}", ['terms' => 'COD', 'expires_at' => '2026-12-31'])
            ->assertOk()->assertJsonPath('data.terms', 'COD')->assertJsonPath('data.expires_at', '2026-12-31');
    }

    public function test_competitors_can_be_attached_created_and_detached(): void
    {
        $this->loginAs();
        $id = $this->postJson('/api/v1/quotes', [])->json('data.id');
        $existing = $this->postJson('/api/v1/competitors', ['name' => 'CV Pesaing'])->assertCreated()->json('data.id');

        $this->postJson("/api/v1/quotes/{$id}/competitors", ['competitor_id' => $existing, 'comment' => 'Harga lebih murah'])
            ->assertCreated()->assertJsonPath('data.competitors.0.comment', 'Harga lebih murah');

        // kompetitor baru langsung dari penawaran
        $this->postJson("/api/v1/quotes/{$id}/competitors", ['name' => 'PT Baru', 'phone' => '031-1'])
            ->assertCreated()->assertJsonCount(2, 'data.competitors');

        // mengulang kompetitor yang sama memperbarui catatan, bukan menggandakan
        $this->postJson("/api/v1/quotes/{$id}/competitors", ['competitor_id' => $existing, 'comment' => 'Revisi'])
            ->assertJsonCount(2, 'data.competitors');

        $this->postJson("/api/v1/quotes/{$id}/competitors", [])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->deleteJson("/api/v1/quotes/{$id}/competitors/{$existing}")->assertOk()->assertJsonCount(1, 'data.competitors');
    }

    // ---------------------------------------------------------------- terhubung ke prospek

    public function test_quote_number_is_issued_when_first_task_is_concluded(): void
    {
        $this->loginAs();
        $lead = $this->lead();
        $this->assertSame(0, Quote::count());

        $res = $this->postJson("/api/v1/lead-tasks/{$lead['current_task']['id']}/conclude", [
            'conclusion' => 'NEXT', 'next_template_id' => $this->template(30)->id,
        ])->assertOk();

        $this->assertMatchesRegularExpression('/^QT-STG-/', $res->json('data.quote.quote_number'));
        $this->assertSame(1, Quote::where('lead_id', $lead['id'])->count());

        // tugas berikutnya tidak membuat penawaran kedua
        $this->postJson("/api/v1/lead-tasks/{$res->json('data.next_task.id')}/conclude", [
            'conclusion' => 'NEXT', 'next_template_id' => $this->template(40)->id,
        ])->assertOk();
        $this->assertSame(1, Quote::where('lead_id', $lead['id'])->count());
    }

    public function test_lead_win_and_lose_close_the_open_quote(): void
    {
        $this->loginAs();

        $won = $this->lead(['business_name' => 'Menang']);
        $this->postJson("/api/v1/lead-tasks/{$won['current_task']['id']}/conclude", ['conclusion' => 'WIN'])->assertOk();
        $this->assertSame('WON', Quote::where('lead_id', $won['id'])->value('status'));

        $lost = $this->lead(['business_name' => 'Kalah']);
        $next = $this->postJson("/api/v1/lead-tasks/{$lost['current_task']['id']}/conclude", [
            'conclusion' => 'NEXT', 'next_template_id' => $this->template(30)->id,
        ])->json('data.next_task');
        $this->postJson("/api/v1/lead-tasks/{$next['id']}/conclude", ['conclusion' => 'LOSE'])->assertOk();
        $this->assertSame('LOST', Quote::where('lead_id', $lost['id'])->value('status'));

        // LOSE pada tugas pertama tidak membuat penawaran baru
        $direct = $this->lead(['business_name' => 'Langsung Kalah']);
        $this->postJson("/api/v1/lead-tasks/{$direct['current_task']['id']}/conclude", ['conclusion' => 'LOSE'])->assertOk();
        $this->assertSame(0, Quote::where('lead_id', $direct['id'])->count());

        // penawaran yang sudah ditutup tidak bisa diubah
        $id = Quote::where('lead_id', $won['id'])->value('id');
        $this->patchJson("/api/v1/quotes/{$id}", ['terms' => 'x'])->assertStatus(422);
    }

    // ---------------------------------------------------------------- konversi ke order

    public function test_convert_quote_to_order_carries_kg_pcs_gramasi_and_money_discount(): void
    {
        $user = $this->loginAs();
        $p = $this->product(28500);
        $pk = $this->packaging($p, 500);
        DiscountStratum::create(['min_kg' => 100, 'max_kg' => 499, 'discount_percent' => 2]);
        $customer = $this->customer($user);
        $lead = $this->lead();

        $quoteId = $this->postJson('/api/v1/quotes', [
            'lead_id' => $lead['id'], 'customer_po' => 'PO-77',
            'lines' => [['product_id' => $p->id, 'packaging_id' => $pk->id, 'qty_kg' => 100, 'disc1_percent' => 1]],
        ])->assertCreated()->json('data.id');

        // customer wajib (penawaran dari prospek belum punya customer)
        $this->postJson("/api/v1/quotes/{$quoteId}/convert-to-order", [])
            ->assertStatus(422)->assertJsonValidationErrors('customer_id');

        $res = $this->postJson("/api/v1/quotes/{$quoteId}/convert-to-order", ['customer_id' => $customer->id])
            ->assertCreated()
            ->assertJsonPath('data.order.destination', 'HO')
            ->assertJsonPath('data.order.customer_po', 'PO-77')
            ->assertJsonPath('data.order.quote_id', $quoteId)
            ->assertJsonPath('data.quote.status', 'WON')
            ->assertJsonPath('data.order.lines.0.qty_kg', '100.000')
            ->assertJsonPath('data.order.lines.0.qty_pcs', 200)
            ->assertJsonPath('data.order.lines.0.gramasi_gr', '500.00')
            ->assertJsonPath('data.order.lines.0.uom', 'PCS')
            ->assertJsonPath('data.order.lines.0.discount', '169860.00')   // 2,98% bertingkat x 5.700.000 dalam rupiah
            ->assertJsonPath('data.order.total', '5530140.00');

        $this->assertEquals(200, $res->json('data.order.lines.0.qty'));

        $freshLead = Lead::findOrFail($lead['id']);
        $this->assertSame('WIN', $freshLead->win_loss);      // order dari prospek => WIN
        $this->assertSame('WON', Quote::findOrFail($quoteId)->status);

        // satu penawaran hanya boleh dijadikan satu order
        $this->postJson("/api/v1/quotes/{$quoteId}/convert-to-order", ['customer_id' => $customer->id])
            ->assertStatus(422);
        $this->assertSame(1, SalesOrder::where('quote_id', $quoteId)->count());
    }

    public function test_convert_validation_for_destination_and_lost_quote(): void
    {
        $user = $this->loginAs();
        $p = $this->product();
        $customer = $this->customer($user, 'C-A');
        $distributor = $this->customer($user, 'C-DIST');

        $mk = fn () => $this->postJson('/api/v1/quotes', [
            'customer_id' => $customer->id,
            'lines' => [['product_id' => $p->id, 'gramasi_gr' => 100, 'qty_kg' => 10]],
        ])->json('data.id');

        $id = $mk();
        $this->postJson("/api/v1/quotes/{$id}/convert-to-order", ['destination' => 'DISTRIBUTOR'])
            ->assertStatus(422)->assertJsonValidationErrors('distributor_customer_id');
        $this->postJson("/api/v1/quotes/{$id}/convert-to-order", [
            'destination' => 'DISTRIBUTOR', 'distributor_customer_id' => $customer->id,
        ])->assertStatus(422)->assertJsonValidationErrors('distributor_customer_id');

        $this->postJson("/api/v1/quotes/{$id}/convert-to-order", [
            'destination' => 'DISTRIBUTOR', 'distributor_customer_id' => $distributor->id,
        ])->assertCreated()
            ->assertJsonPath('data.order.destination', 'DISTRIBUTOR')
            ->assertJsonPath('data.order.distributor_customer_id', $distributor->id);

        $lost = $mk();
        Quote::whereKey($lost)->update(['status' => 'LOST']);
        $this->postJson("/api/v1/quotes/{$lost}/convert-to-order", [])->assertStatus(422);

        // penawaran tanpa baris
        $empty = $this->postJson('/api/v1/quotes', ['customer_id' => $customer->id])->json('data.id');
        $this->postJson("/api/v1/quotes/{$empty}/convert-to-order", [])->assertStatus(422);
    }

    public function test_other_sales_cannot_see_or_change_a_quote(): void
    {
        $this->loginAs();
        $id = $this->postJson('/api/v1/quotes', [])->json('data.id');

        $this->loginAs();
        $this->getJson("/api/v1/quotes/{$id}")->assertForbidden();
        $this->patchJson("/api/v1/quotes/{$id}", ['terms' => 'x'])->assertForbidden();
        $this->putJson("/api/v1/quotes/{$id}/lines", ['lines' => []])->assertForbidden();
        $this->postJson("/api/v1/quotes/{$id}/convert-to-order", [])->assertForbidden();
        $this->getJson('/api/v1/quotes')->assertOk()->assertJsonCount(0, 'data.data');
    }

    public function test_cannot_create_quote_for_someone_elses_lead(): void
    {
        $this->loginAs();
        $lead = $this->lead();
        $this->loginAs();
        $this->postJson('/api/v1/quotes', ['lead_id' => $lead['id']])->assertForbidden();
    }

    // ---------------------------------------------------------------- order berbasis Kg + tujuan

    public function test_order_line_by_kg_is_converted_by_the_server(): void
    {
        $user = $this->loginAs();
        $p = $this->product(1000);
        $pk = $this->packaging($p, 250);
        $customer = $this->customer($user);

        $this->postJson('/api/v1/orders', [
            'customer_id' => $customer->id,
            'lines' => [['product_id' => $p->id, 'packaging_id' => $pk->id, 'qty_kg' => 10, 'qty' => 999]],
        ])->assertCreated()
            ->assertJsonPath('data.lines.0.qty_pcs', 40)                    // 10 kg x 1000 / 250 gr
            ->assertJsonPath('data.lines.0.qty_kg', '10.000')
            ->assertJsonPath('data.lines.0.uom', 'PCS')
            ->assertJsonPath('data.total', '40000.00');                     // qty klien (999) diabaikan
    }

    public function test_order_kg_line_and_destination_validation(): void
    {
        $user = $this->loginAs();
        $p = $this->product(1000);
        $other = $this->product(1000, 'Lain');
        $foreign = $this->packaging($other, 100);
        $customer = $this->customer($user);

        $base = ['customer_id' => $customer->id];

        $this->postJson('/api/v1/orders', $base + ['lines' => [['product_id' => $p->id, 'qty_kg' => 5]]])
            ->assertStatus(422)->assertJsonValidationErrors('lines.0.gramasi_gr');

        $this->postJson('/api/v1/orders', $base + ['lines' => [['product_id' => $p->id, 'packaging_id' => $foreign->id, 'qty_kg' => 5]]])
            ->assertStatus(422)->assertJsonValidationErrors('lines.0.packaging_id');

        $this->postJson('/api/v1/orders', $base + ['lines' => [['product_id' => $p->id]]])
            ->assertStatus(422)->assertJsonValidationErrors('lines.0.qty');

        $this->postJson('/api/v1/orders', $base + ['destination' => 'DISTRIBUTOR', 'lines' => [['product_id' => $p->id, 'qty' => 1]]])
            ->assertStatus(422)->assertJsonValidationErrors('distributor_customer_id');

        $this->postJson('/api/v1/orders', $base + ['destination' => 'LAINNYA', 'lines' => [['product_id' => $p->id, 'qty' => 1]]])
            ->assertStatus(422)->assertJsonValidationErrors('destination');

        // qty biasa tetap berfungsi, tujuan default HO
        $this->postJson('/api/v1/orders', $base + ['lines' => [['product_id' => $p->id, 'qty' => 3]]])
            ->assertCreated()->assertJsonPath('data.destination', 'HO')->assertJsonPath('data.lines.0.qty_kg', null);

        $this->assertSame(1, SalesOrder::count()); // yang gagal tidak meninggalkan order
    }

    // ---------------------------------------------------------------- master data

    public function test_master_data_is_manager_only(): void
    {
        $p = $this->product();
        $this->loginAs('sales');

        $this->postJson('/api/v1/product-packagings', ['product_id' => $p->id, 'name' => 'X', 'gramasi_gr' => 10])->assertForbidden();
        $this->postJson('/api/v1/discount-strata', ['min_kg' => 1, 'discount_percent' => 1])->assertForbidden();
        $this->postJson('/api/v1/code-mappings', ['entity_type' => 'product', 'local_id' => $p->id, 'external_code' => 'X'])->assertForbidden();
        $this->getJson('/api/v1/code-mappings')->assertForbidden();

        // membaca kemasan & strata boleh (dipakai form penawaran)
        $this->getJson('/api/v1/product-packagings')->assertOk();
        $this->getJson('/api/v1/discount-strata')->assertOk();

        $this->loginAs('supervisor');
        $pk = $this->postJson('/api/v1/product-packagings', ['product_id' => $p->id, 'name' => 'Sachet', 'gramasi_gr' => 20])
            ->assertCreated()->json('data.id');
        $this->postJson('/api/v1/product-packagings', ['product_id' => $p->id, 'name' => 'Ganda', 'gramasi_gr' => 20])
            ->assertStatus(422)->assertJsonValidationErrors('gramasi_gr');
        $this->patchJson("/api/v1/product-packagings/{$pk}", ['name' => 'Sachet 20 gr'])->assertOk();
        $this->deleteJson("/api/v1/product-packagings/{$pk}")->assertOk();
    }

    public function test_strata_management_and_preview(): void
    {
        $p = $this->product();
        $this->loginAs('admin');

        $this->postJson('/api/v1/discount-strata', ['min_kg' => 100, 'max_kg' => 50, 'discount_percent' => 2])
            ->assertStatus(422)->assertJsonValidationErrors('max_kg');
        $this->postJson('/api/v1/discount-strata', ['min_kg' => 100, 'discount_percent' => 150])
            ->assertStatus(422)->assertJsonValidationErrors('discount_percent');

        $id = $this->postJson('/api/v1/discount-strata', ['min_kg' => 100, 'discount_percent' => 2.5])->assertCreated()->json('data.id');

        $this->getJson("/api/v1/discount-strata/preview?product_id={$p->id}&qty_kg=150")
            ->assertOk()->assertJsonPath('data.strata_percent', 2.5);
        $this->getJson("/api/v1/discount-strata/preview?product_id={$p->id}&qty_kg=10")
            ->assertOk()->assertJsonPath('data.strata_percent', 0);
        $this->getJson('/api/v1/discount-strata/preview')->assertStatus(422);

        $this->patchJson("/api/v1/discount-strata/{$id}", ['active' => false])->assertOk();
        $this->getJson("/api/v1/discount-strata/preview?qty_kg=150")->assertJsonPath('data.strata_percent', 0);
        $this->deleteJson("/api/v1/discount-strata/{$id}")->assertOk();
        $this->deleteJson("/api/v1/discount-strata/{$id}")->assertNotFound();
    }

    public function test_code_mapping_upsert_and_validation(): void
    {
        $user = $this->loginAs('admin');
        $p = $this->product();
        $c = $this->customer($user);

        $this->postJson('/api/v1/code-mappings', ['entity_type' => 'product', 'local_id' => $p->id, 'external_code' => 'FG-001'])
            ->assertCreated()->assertJsonPath('data.external_system', 'epicor');

        // kode lokal yang sama untuk sistem yang sama menimpa, bukan menggandakan
        $this->postJson('/api/v1/code-mappings', ['entity_type' => 'product', 'local_id' => $p->id, 'external_code' => 'FG-002'])
            ->assertOk()->assertJsonPath('data.external_code', 'FG-002');

        $this->postJson('/api/v1/code-mappings', ['entity_type' => 'customer', 'local_id' => $c->id, 'external_code' => 'Cust-9'])->assertCreated();
        $this->postJson('/api/v1/code-mappings', ['entity_type' => 'customer', 'local_id' => 99999, 'external_code' => 'X'])->assertStatus(422);
        $this->postJson('/api/v1/code-mappings', ['entity_type' => 'gudang', 'local_id' => 1, 'external_code' => 'X'])
            ->assertStatus(422)->assertJsonValidationErrors('entity_type');

        $this->getJson('/api/v1/code-mappings?entity_type=product')->assertOk()->assertJsonCount(1, 'data');
    }
}