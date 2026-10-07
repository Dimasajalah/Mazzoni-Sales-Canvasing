<?php

namespace Tests\Feature;

use App\Models\ProductSample;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Poin 9 (hasil meeting Okt 2026): sample baru berstatus "Menunggu pemberian sample" (PENDING)
 * sampai sales menekan tombol "Tandai sudah diberikan", yang mengubahnya jadi DELIVERED.
 */
class ProductSampleDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_new_sample_starts_as_pending(): void
    {
        $this->sales();

        $res = $this->postJson('/api/v1/samples', [
            'product_group' => 'Saus Tomat', 'qty' => 100, 'batch_number' => 'B-1',
        ])->assertCreated();

        $res->assertJsonPath('data.status', ProductSample::STATUS_PENDING)
            ->assertJsonPath('data.delivered_at', null);
    }

    public function test_deliver_marks_sample_delivered_with_timestamp(): void
    {
        $this->sales();
        $id = $this->postJson('/api/v1/samples', [
            'product_group' => 'Saus Tomat', 'qty' => 100, 'batch_number' => 'B-1',
        ])->json('data.id');

        $res = $this->postJson("/api/v1/samples/{$id}/deliver")->assertOk();

        $res->assertJsonPath('data.status', ProductSample::STATUS_DELIVERED);
        $this->assertNotNull($res->json('data.delivered_at'));
        $this->assertSame(ProductSample::STATUS_DELIVERED, ProductSample::find($id)->status);
    }

    public function test_deliver_is_idempotent_and_keeps_first_timestamp(): void
    {
        $this->sales();
        $id = $this->postJson('/api/v1/samples', [
            'product_group' => 'Saus Tomat', 'qty' => 100, 'batch_number' => 'B-1',
        ])->json('data.id');

        $this->postJson("/api/v1/samples/{$id}/deliver")->assertOk();
        $first = ProductSample::find($id)->delivered_at;

        $this->travel(1)->hours();
        $this->postJson("/api/v1/samples/{$id}/deliver")->assertOk();

        $this->assertTrue(ProductSample::find($id)->delivered_at->equalTo($first));
    }

    public function test_deliver_returns_404_for_unknown_sample(): void
    {
        $this->sales();

        $this->postJson('/api/v1/samples/99999/deliver')->assertNotFound();
    }

    public function test_migration_backfills_legacy_samples_as_already_delivered(): void
    {
        $path = 'database/migrations/2026_10_02_000002_add_delivery_status_to_product_samples.php';

        Artisan::call('migrate:rollback', ['--path' => $path, '--force' => true]);
        $this->assertFalse(Schema::hasColumn('product_samples', 'status'));

        $legacyId = DB::table('product_samples')->insertGetId([
            'product_name' => 'Sample', 'qty' => 50, 'created_at' => now(), 'updated_at' => now(),
        ]);

        Artisan::call('migrate', ['--path' => $path, '--force' => true]);

        $legacy = DB::table('product_samples')->find($legacyId);
        $this->assertSame(ProductSample::STATUS_DELIVERED, $legacy->status);
        $this->assertNotNull($legacy->delivered_at);
    }
}