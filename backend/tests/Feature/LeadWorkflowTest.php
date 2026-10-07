<?php
//backend/tests/Feature/LeadWorkflowTest.php
namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\Product;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Stage/Status lead, mesin tugas (template B2B), form journey, foto toko,
 * dashboard pipeline, dan auto-Win dari order.
 */
class LeadWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    private function b2b(): TaskSet
    {
        return TaskSet::where('code', 'B2B')->firstOrFail();
    }

    private function template(int $seq, ?TaskSet $set = null): TaskTemplate
    {
        return TaskTemplate::where('task_set_id', ($set ?? $this->b2b())->id)->where('seq', $seq)->firstOrFail();
    }

    private function createLead(array $extra = []): array
    {
        $response = $this->postJson('/api/v1/leads', array_merge([
            'business_name' => 'UD Uji Coba',
            'ktp' => '3578010101900001',
            'task_set_id' => $this->b2b()->id,
        ], $extra));

        $response->assertCreated();

        return $response->json('data');
    }

    public function test_lead_requires_ktp_and_valid_stage(): void
    {
        $this->sales();

        // KTP sekarang opsional saat membuat lead (kelompok Customer Contact, poin 3)
        $this->postJson('/api/v1/leads', ['business_name' => 'Tanpa KTP'])
            ->assertCreated();

        $this->postJson('/api/v1/leads', ['business_name' => 'X', 'ktp' => '1', 'stage' => 'WON'])
            ->assertStatus(422)->assertJsonValidationErrors('stage');

        $this->postJson('/api/v1/leads', ['business_name' => 'X', 'ktp' => '1', 'win_loss' => 'MAYBE'])
            ->assertStatus(422)->assertJsonValidationErrors('win_loss');
    }

    public function test_b2b_lead_spawns_first_task_and_b2c_does_not(): void
    {
        $user = $this->sales();

        $lead = $this->createLead();
        $this->assertSame('LEAD', $lead['stage']);
        $this->assertSame('OPEN', $lead['win_loss']);
        $this->assertSame(10, $lead['current_task']['seq']);
        $this->assertSame($user->id, $lead['current_task']['assigned_to']);
        // Poin 7: Canvassing B2B dirampingkan jadi 4 tahap; "Brand Awareness" sekarang tugas pertama.
        $this->assertSame('Brand Awareness', $lead['current_task']['name']);
        $this->assertSame('brand_awareness', $lead['current_task']['pipeline_step']);

        $b2c = TaskSet::where('code', 'B2C')->firstOrFail();
        $noTasks = $this->createLead(['business_name' => 'Ritel B2C', 'task_set_id' => $b2c->id]);
        $this->assertNull($noTasks['current_task']);

        $none = $this->createLead(['business_name' => 'Tanpa Task Set', 'task_set_id' => null]);
        $this->assertNull($none['current_task']);
    }

    public function test_conclude_next_creates_next_task_and_moves_stage(): void
    {
        $this->sales();
        $lead = $this->createLead();
        $taskId = $lead['current_task']['id'];

        $response = $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", [
            'conclusion' => 'NEXT',
            'next_template_id' => $this->template(20)->id,
            'due_date' => '2026-10-01',
            'remark' => 'Tertarik, lanjut sample',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.task.status', 'DONE')
            ->assertJsonPath('data.task.conclusion', 'NEXT')
            ->assertJsonPath('data.next_task.seq', 20)
            ->assertJsonPath('data.next_task.due_date', '2026-10-01')
            // Poin 7: tugas pertama B2B sekarang Brand Awareness (seq 10) sendiri; lanjut Next
            // membawa ke Sample (seq 20, stage OPPORTUNITY) dan status_customer maju ke SAMPLING.
            ->assertJsonPath('data.lead.stage', 'OPPORTUNITY')
            ->assertJsonPath('data.lead.win_loss', 'OPEN')
            ->assertJsonPath('data.lead.status_customer', 'SAMPLING');

        $this->assertSame(1, LeadTask::where('lead_id', $lead['id'])->where('status', 'OPEN')->count());
    }

    public function test_next_validation_rules(): void
    {
        $this->sales();
        $lead = $this->createLead();
        $taskId = $lead['current_task']['id'];

        // tanpa tugas berikutnya
        $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", ['conclusion' => 'NEXT'])
            ->assertStatus(422)->assertJsonValidationErrors('next_template_id');

        // tugas yang sama
        $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", [
            'conclusion' => 'NEXT',
            'next_template_id' => $this->template(10)->id,
        ])->assertStatus(422)->assertJsonValidationErrors('next_template_id');

        // template dari Task Set lain
        $other = TaskSet::create(['code' => 'X', 'name' => 'X', 'active' => true]);
        $foreign = TaskTemplate::create([
            'task_set_id' => $other->id,
            'seq' => 10,
            'name' => 'Asing',
            'task_type' => 'Kunjungan',
            'stage' => 'LEAD',
            'pipeline_step' => 'lead',
            'actions' => [],
        ]);
        $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", [
            'conclusion' => 'NEXT',
            'next_template_id' => $foreign->id,
        ])->assertStatus(422)->assertJsonValidationErrors('next_template_id');

        $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", ['conclusion' => 'BUKAN'])
            ->assertStatus(422)->assertJsonValidationErrors('conclusion');
    }

    public function test_closing_task_only_allows_win_or_lose(): void
    {
        $this->sales();
        $lead = $this->createLead();
        $first = $lead['current_task']['id'];

        $task = LeadTask::findOrFail($first);
        $closing = app(\App\Services\LeadTaskService::class)
            ->createFromTemplate(Lead::findOrFail($lead['id']), $this->template(40), $task->assigned_to, null);
        $task->update(['status' => 'DONE']);

        $this->postJson("/api/v1/lead-tasks/{$closing->id}/conclude", [
            'conclusion' => 'NEXT',
            'next_template_id' => $this->template(20)->id,
        ])->assertStatus(422)->assertJsonValidationErrors('conclusion');
    }

    public function test_win_sets_status_and_stage_and_closes_tasks(): void
    {
        $this->sales();
        $lead = $this->createLead();
        $taskId = $lead['current_task']['id'];

        $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", ['conclusion' => 'WIN', 'remark' => 'Deal'])
            ->assertOk()
            ->assertJsonPath('data.lead.win_loss', 'WIN')
            ->assertJsonPath('data.lead.stage', 'QUOTE')
            ->assertJsonPath('data.next_task', null);

        $this->assertSame(0, LeadTask::where('lead_id', $lead['id'])->where('status', 'OPEN')->count());

        // prospek sudah ditutup: konklusi lain ditolak
        $again = app(\App\Services\LeadTaskService::class)
            ->createFromTemplate(Lead::findOrFail($lead['id']), $this->template(30), null, null);
        $this->postJson("/api/v1/lead-tasks/{$again->id}/conclude", ['conclusion' => 'LOSE'])
            ->assertStatus(422);
    }

    public function test_lose_keeps_current_stage(): void
    {
        $this->sales();
        $lead = $this->createLead();

        $next = $this->postJson("/api/v1/lead-tasks/{$lead['current_task']['id']}/conclude", [
            'conclusion' => 'NEXT',
            'next_template_id' => $this->template(20)->id,
        ])->json('data.next_task');

        $this->postJson("/api/v1/lead-tasks/{$next['id']}/conclude", ['conclusion' => 'LOSE'])
            ->assertOk()
            ->assertJsonPath('data.lead.win_loss', 'LOSE')
            ->assertJsonPath('data.lead.stage', 'OPPORTUNITY');
    }

    public function test_other_sales_cannot_touch_someones_task(): void
    {
        $this->sales();
        $lead = $this->createLead();
        $taskId = $lead['current_task']['id'];

        $intruder = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($intruder);

        $this->postJson("/api/v1/lead-tasks/{$taskId}/conclude", ['conclusion' => 'WIN'])->assertForbidden();
        $this->patchJson("/api/v1/lead-tasks/{$taskId}", ['remark' => 'x'])->assertForbidden();
        $this->getJson("/api/v1/leads/{$lead['id']}/tasks")->assertForbidden();
        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND',
            'decision' => 'INTERESTED',
        ])->assertForbidden();
        $this->postJson("/api/v1/leads/{$lead['id']}/photo", [
            'photo' => UploadedFile::fake()->image('toko.jpg'),
        ])->assertForbidden();

        // dan tugas itu tidak muncul di daftar Activities miliknya
        $this->getJson('/api/v1/lead-tasks')->assertOk()->assertJsonCount(0, 'data.items');
    }

    public function test_activities_summary_counts(): void
    {
        $this->sales();
        $a = $this->createLead(['business_name' => 'A']); // belum dijadwalkan
        $b = $this->createLead(['business_name' => 'B']);
        $c = $this->createLead(['business_name' => 'C']);

        $this->patchJson("/api/v1/lead-tasks/{$b['current_task']['id']}", ['due_date' => now()->subDays(2)->toDateString()])->assertOk();
        $this->patchJson("/api/v1/lead-tasks/{$c['current_task']['id']}", ['due_date' => now()->addDays(3)->toDateString()])->assertOk();

        $this->getJson('/api/v1/lead-tasks')
            ->assertOk()
            ->assertJsonPath('data.summary', ['unscheduled' => 1, 'late' => 1, 'scheduled' => 1, 'total' => 3])
            ->assertJsonCount(3, 'data.items');
    }

    public function test_dashboard_pipeline_has_eight_status_customer_steps(): void
    {
        $this->sales();
        $this->createLead(['business_name' => 'Satu']);                  // Prospek (default)
        // Poin 7: B2B sekarang mulai LANGSUNG di tugas Brand Awareness (seq 10), jadi status
        // BRAND_AWARENESS tidak lagi tercapai lewat conclude-Next biasa (tidak ada tugas
        // sebelumnya yang "masuk" ke situ) — disetel langsung untuk menguji hitungan dashboard-nya.
        $two = $this->createLead(['business_name' => 'Dua']);
        Lead::find($two['id'])->update(['status_customer' => Lead::STATUS_BRAND_AWARENESS]);                                                 // Brand Awareness
        $three = $this->createLead(['business_name' => 'Tiga']);
        $this->postJson("/api/v1/lead-tasks/{$three['current_task']['id']}/conclude", ['conclusion' => 'WIN'])->assertOk();
        $four = $this->createLead(['business_name' => 'Empat']);
        $this->postJson("/api/v1/lead-tasks/{$four['current_task']['id']}/conclude", ['conclusion' => 'LOSE'])->assertOk();

        $pipeline = collect($this->getJson('/api/v1/dashboard')->assertOk()->json('data.pipeline'));

        $this->assertSame(
            ['LEAD', 'PROSPEK', 'BRAND_AWARENESS', 'SAMPLING', 'QUOTATION', 'WIN', 'LOSE', 'DISTRIBUTION'],
            $pipeline->pluck('key')->all()
        );
        $counts = $pipeline->pluck('count', 'key');
        $this->assertSame(1, $counts['PROSPEK']);
        $this->assertSame(1, $counts['BRAND_AWARENESS']);
        $this->assertSame(1, $counts['WIN']);
        $this->assertSame(1, $counts['LOSE']);
        $this->assertSame(0, $counts['LEAD']); // belum ada alur data mentah HQ di app ini
        $this->assertSame(0, $counts['DISTRIBUTION']);
    }

    public function test_journey_entries_validation_and_storage(): void
    {
        $this->sales();
        $lead = $this->createLead();
        $taskId = $lead['current_task']['id'];

        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", ['entry_type' => 'BRAND'])
            ->assertStatus(422)->assertJsonValidationErrors('decision');

        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", ['entry_type' => 'NEGOTIATION'])
            ->assertStatus(422)->assertJsonValidationErrors('offer');

        // tugas milik lead lain tidak boleh dikaitkan
        $other = $this->createLead(['business_name' => 'Lain']);
        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND',
            'decision' => 'INTERESTED',
            'lead_task_id' => $other['current_task']['id'],
        ])->assertStatus(422)->assertJsonValidationErrors('lead_task_id');

        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'BRAND',
            'decision' => 'NOT_INTERESTED',
            'reason' => 'Sudah punya pemasok',
            'lead_task_id' => $taskId,
        ])->assertCreated()->assertJsonPath('data.entry.decision', 'NOT_INTERESTED');

        $this->postJson("/api/v1/leads/{$lead['id']}/journey-entries", [
            'entry_type' => 'NEGOTIATION',
            'offer' => 'Diskon 3% min. 100 Kg',
            'next_action_date' => '2026-10-05',
        ])->assertCreated();

        $this->getJson("/api/v1/leads/{$lead['id']}/journey-entries")->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_store_photo_upload(): void
    {
        Storage::fake('public');
        $this->sales();
        $lead = $this->createLead();

        $this->postJson("/api/v1/leads/{$lead['id']}/photo", ['photo' => UploadedFile::fake()->create('doc.pdf', 10)])
            ->assertStatus(422)->assertJsonValidationErrors('photo');

        $response = $this->postJson("/api/v1/leads/{$lead['id']}/photo", [
            'photo' => UploadedFile::fake()->image('toko.jpg', 400, 300),
        ])->assertOk();

        $path = Lead::findOrFail($lead['id'])->store_photo_path;
        $this->assertNotNull($path);
        Storage::disk('public')->assertExists($path);
        $this->assertNotNull($response->json('data.store_photo_url'));
    }

    public function test_order_from_lead_marks_lead_win(): void
    {
        $user = $this->sales();
        $lead = $this->createLead();

        $customer = Customer::create([
            'customer_code' => 'C-LEAD-01',
            'name' => 'PT Dari Lead',
            'city' => 'Surabaya',
            'salesperson_id' => $user->id,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);
        $product = Product::create([
            'part_num' => 'STM-1000',
            'description' => 'Saus Tomat 1kg',
            'uom' => 'PCS',
            'price' => 28500,
            'active' => true,
            'sync_status' => 'NOT_REQUIRED',
        ]);

        $this->postJson('/api/v1/orders', [
            'customer_id' => $customer->id,
            'lead_id' => $lead['id'],
            'lines' => [['product_id' => $product->id, 'qty' => 5]],
        ])->assertCreated();

        $fresh = Lead::findOrFail($lead['id']);
        $this->assertSame('WIN', $fresh->win_loss);
        $this->assertSame('QUOTE', $fresh->stage);
        $this->assertSame(0, LeadTask::where('lead_id', $lead['id'])->where('status', 'OPEN')->count());
    }

    public function test_sample_and_feedback_accept_lead_task_id(): void
    {
        $this->sales();
        $lead = $this->createLead();
        $taskId = $lead['current_task']['id'];

        $this->postJson('/api/v1/samples', [
            'lead_id' => $lead['id'],
            'lead_task_id' => $taskId,
            'product_group' => 'Saus Sambal',
            'qty' => 200,
            'batch_number' => 'B-001',
        ])->assertCreated()->assertJsonPath('data.lead_task_id', $taskId);

        $this->postJson('/api/v1/sample-feedbacks', [
            'lead_id' => $lead['id'],
            'lead_task_id' => $taskId,
            'product_group' => 'Saus Sambal',
            'qty' => 200,
            'batch_number' => 'B-1',
            'storage_location' => 'Gudang A',
            'feedback_type' => 'interest',
        ])->assertCreated()->assertJsonPath('data.feedback.lead_task_id', $taskId);
    }

    public function test_migration_remaps_legacy_stage_values(): void
    {
        $path = 'database/migrations/2026_09_28_000001_add_win_loss_and_store_photo_to_leads_table.php';

        // Mundur ke kondisi database pengguna sebelum Paket 1 (kolom win_loss belum ada)
        Artisan::call('migrate:rollback', ['--path' => $path, '--force' => true]);
        $this->assertFalse(Schema::hasColumn('leads', 'win_loss'));

        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        foreach (['NEW', 'CONTACTED', 'QUALIFIED', 'QUOTE', 'WON', 'LOST', 'LEAD', 'OPPORTUNITY'] as $i => $stage) {
            DB::table('leads')->insert([
                'business_name' => "Legacy {$stage}",
                'stage' => $stage,
                'salesperson_id' => $user->id,
                'client_uuid' => (string) Str::uuid(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Jalankan migration ASLI
        Artisan::call('migrate', ['--path' => $path, '--force' => true]);
        $this->assertTrue(Schema::hasColumn('leads', 'win_loss'));
        $this->assertTrue(Schema::hasColumn('leads', 'store_photo_path'));

        $by = fn(string $name) => DB::table('leads')->where('business_name', "Legacy {$name}")->first();

        $this->assertSame(['LEAD', 'OPEN'], [$by('NEW')->stage, $by('NEW')->win_loss]);
        $this->assertSame(['LEAD', 'OPEN'], [$by('CONTACTED')->stage, $by('CONTACTED')->win_loss]);
        $this->assertSame(['OPPORTUNITY', 'OPEN'], [$by('QUALIFIED')->stage, $by('QUALIFIED')->win_loss]);
        $this->assertSame(['QUOTE', 'OPEN'], [$by('QUOTE')->stage, $by('QUOTE')->win_loss]);
        $this->assertSame(['QUOTE', 'WIN'], [$by('WON')->stage, $by('WON')->win_loss]);
        $this->assertSame(['LEAD', 'LOSE'], [$by('LOST')->stage, $by('LOST')->win_loss]);
        // nilai yang sudah benar tidak boleh berubah
        $this->assertSame(['LEAD', 'OPEN'], [$by('LEAD')->stage, $by('LEAD')->win_loss]);
        $this->assertSame(['OPPORTUNITY', 'OPEN'], [$by('OPPORTUNITY')->stage, $by('OPPORTUNITY')->win_loss]);

        $this->assertSame([], DB::table('leads')->whereNotIn('stage', Lead::STAGES)->pluck('stage')->all());
    }
}
