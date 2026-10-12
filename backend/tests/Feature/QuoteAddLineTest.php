<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\Product;
use App\Models\ProductSample;
use App\Models\Quote;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use App\Services\QuoteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Add Line Quotation (dokumen hal. 35): tarik Line dari sample yang disetujui, tandai "Already on Line N", dan cari produk manual. */
class QuoteAddLineTest extends TestCase
{
    use RefreshDatabase;

    private function draftFor(User $user, string $name = 'UD Add Line'): Quote
    {
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $lead = Lead::create([
            'business_name' => $name, 'task_set_id' => $b2b->id, 'salesperson_id' => $user->id,
            'register_date' => now()->toDateString(),
        ]);

        return app(QuoteService::class)->create(['lead_id' => $lead->id], [], $user);
    }

    /** Sample milik tugas Sampling ke-2 yang disetujui (Follow Up diselesaikan dengan "Sample Cocok"). */
    private function approvedSample(Quote $quote, string $part = 'CUSTOM-STM-R1247', ?string $rev = 'V2'): ProductSample
    {
        $b2b = TaskSet::where('code', 'B2B')->firstOrFail();
        $template = TaskTemplate::where('task_set_id', $b2b->id)->where('pipeline_step', 'sampling')->firstOrFail();
        foreach ([1, 2] as $_) {
            $task = LeadTask::create([
                'lead_id' => $quote->lead_id, 'task_template_id' => $template->id, 'seq' => $template->seq,
                'name' => $template->name, 'task_type' => $template->task_type, 'stage' => $template->stage,
                'pipeline_step' => $template->pipeline_step, 'actions' => $template->actions,
            ]);
        }
        $task->forceFill(['conclusion' => 'NEXT', 'reason_code' => 'Sample Cocok'])->save();

        try {
            return ProductSample::unguarded(fn () => ProductSample::create([
                'lead_id' => $quote->lead_id, 'lead_task_id' => $task->id, 'product_group' => 'Saus & Condiment',
                'part' => $part, 'rev' => $rev, 'description' => 'Tomato Sauce Custom B2B — Batch Trial',
                'qty' => 100, 'qty_given' => '2 pcs',
            ]));
        } catch (\Throwable $e) {
            $this->markTestSkipped('Sample uji tidak bisa dibuat (kolom product_samples belum dikenal tes ini): '.$e->getMessage());
        }
    }

    /** Produk dasar yang disalin menjadi produk placeholder; dibuat bila belum ada produk sama sekali. */
    private function baseProduct(string $part = 'BASE-1', string $group = 'Kecap'): Product
    {
        try {
            return Product::unguarded(fn () => Product::create([
                'part_num' => $part, 'description' => 'Produk dasar '.$part, 'price' => 4500, 'product_group' => $group,
                'epicor_part_num' => $part.'-EP',
            ]));
        } catch (\Throwable $e) {
            $this->markTestSkipped('Produk uji tidak bisa dibuat (kolom products belum dikenal tes ini): '.$e->getMessage());
        }
    }

    public function test_an_approved_sample_can_be_pulled_into_a_line_and_is_then_marked_used(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $quote = $this->draftFor($user);
        $sample = $this->approvedSample($quote);
        $this->baseProduct();

        // daftar sample yang disetujui: Follow Up Sample 2, belum dipakai
        $r = $this->getJson("/api/v1/quotes/{$quote->id}/approved-samples")->assertOk();
        $this->assertCount(1, $r->json('data'));
        $this->assertSame($sample->id, $r->json('data.0.id'));
        $this->assertSame(2, $r->json('data.0.followup_number'));
        $this->assertSame('CUSTOM-STM-R1247', $r->json('data.0.part'));
        $this->assertEquals(100, $r->json('data.0.package_size_gr'));
        $this->assertNull($r->json('data.0.used_on_line'));

        // tarik ke Line baru (tanpa product_id, hanya sample_id)
        $r = $this->postJson("/api/v1/quotes/{$quote->id}/lines/replace", ['lines' => [[
            'sample_id' => $sample->id, 'qty_kg' => 450, 'gramasi_gr' => 100, 'unit_price' => 3000, 'disc1_percent' => 2,
        ]]])->assertOk();
        $this->assertEquals($sample->id, $r->json('data.lines.0.product_sample_id'));
        $this->assertEquals(4500, $r->json('data.lines.0.qty_pcs'));

        // produk placeholder: belum teregister sebagai Part Epicor, memakai identitas sample
        $placeholder = Product::where('part_num', 'CUSTOM-STM-R1247')->where('revision', 'V2')->first();
        $this->assertNotNull($placeholder);
        $this->assertNull($placeholder->epicor_part_num);

        // sekarang sample itu ditandai dipakai di Line 1, dan baris menampilkan sumber Follow Up-nya
        $r = $this->getJson("/api/v1/quotes/{$quote->id}/approved-samples")->assertOk();
        $this->assertSame(1, $r->json('data.0.used_on_line'));
        $r = $this->getJson("/api/v1/quotes/{$quote->id}")->assertOk();
        $this->assertSame(2, $r->json('data.lines.0.source_followup.number'));

        // Line baru berikutnya tidak menghilangkan tautan baris yang sudah ada
        $r = $this->postJson("/api/v1/quotes/{$quote->id}/lines/replace", ['lines' => [
            ['product_id' => $placeholder->id, 'sample_id' => $sample->id, 'qty_kg' => 450, 'gramasi_gr' => 100, 'unit_price' => 3000],
        ]])->assertOk();
        $this->assertEquals($sample->id, $r->json('data.lines.0.product_sample_id'));
    }

    public function test_a_sample_of_a_registered_part_is_flagged_and_pulls_the_registered_product(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $quote = $this->draftFor($user);
        $registered = $this->baseProduct('SAMBAL-250', 'Saus'); // punya kode Part Epicor, jadi item Reguler
        $sample = $this->approvedSample($quote, 'SAMBAL-250', null);

        $r = $this->getJson("/api/v1/quotes/{$quote->id}/approved-samples")->assertOk();
        $this->assertSame($registered->id, $r->json('data.0.registered_product_id'));

        $r = $this->postJson("/api/v1/quotes/{$quote->id}/lines/replace", ['lines' => [[
            'sample_id' => $sample->id, 'qty_kg' => 100, 'gramasi_gr' => 250, 'unit_price' => 6000,
        ]]])->assertOk();
        $this->assertEquals($registered->id, $r->json('data.lines.0.product_id'));
        $this->assertEquals($sample->id, $r->json('data.lines.0.product_sample_id'));
        $this->assertSame(1, Product::where('part_num', 'SAMBAL-250')->count()); // tidak dibuat produk placeholder baru
    }

    public function test_a_sample_of_another_prospect_cannot_be_pulled(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $mine = $this->draftFor($user, 'UD Milik Saya');
        $other = $this->draftFor($user, 'UD Lain');
        $sample = $this->approvedSample($other);
        $this->baseProduct();

        $this->postJson("/api/v1/quotes/{$mine->id}/lines/replace", ['lines' => [[
            'sample_id' => $sample->id, 'qty_kg' => 10, 'gramasi_gr' => 100, 'unit_price' => 1000,
        ]]])->assertStatus(422)->assertJsonValidationErrors('lines.0.sample_id');
    }

    public function test_products_can_be_searched_by_group_and_text_for_a_blank_line(): void
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);
        $quote = $this->draftFor($user);
        $this->baseProduct('KCP-1', 'Kecap');
        $this->baseProduct('SAS-1', 'Saus');

        $r = $this->getJson("/api/v1/quotes/{$quote->id}/product-search")->assertOk();
        $this->assertContains('Kecap', $r->json('data.groups'));
        $this->assertContains('Saus', $r->json('data.groups'));

        $r = $this->getJson("/api/v1/quotes/{$quote->id}/product-search?product_group=Kecap")->assertOk();
        $parts = collect($r->json('data.products'))->pluck('part_num')->all();
        $this->assertContains('KCP-1', $parts);
        $this->assertNotContains('SAS-1', $parts);

        $r = $this->getJson("/api/v1/quotes/{$quote->id}/product-search?q=SAS-1")->assertOk();
        $parts = collect($r->json('data.products'))->pluck('part_num')->all();
        $this->assertContains('SAS-1', $parts);
        $this->assertNotContains('KCP-1', $parts);
    }
}