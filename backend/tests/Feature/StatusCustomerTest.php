<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Revisi pipeline (meeting Okt 2026): field status_customer (Lead/Prospek/Brand Awareness/
 * Sampling/Quotation/Win/Lose/Distribution) menggantikan Stage+Status sebagai acuan utama.
 * stage/win_loss tetap ada sebagai kolom turunan otomatis, supaya kode lama yang masih
 * membacanya (delegasi, laporan NOO, validasi order) terus benar tanpa diubah.
 */
class StatusCustomerTest extends TestCase
{
    use RefreshDatabase;

    private function sales(): User
    {
        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_self_registered_lead_starts_at_prospek_not_lead(): void
    {
        $this->sales();

        $res = $this->postJson('/api/v1/leads', ['business_name' => 'UD Baru'])->assertCreated();

        $this->assertSame(Lead::STATUS_PROSPEK, $res->json('data.status_customer'));
        // stage/win_loss lama tetap ikut terturunkan dengan benar untuk kode yang masih membacanya
        $this->assertSame('LEAD', $res->json('data.stage'));
        $this->assertSame('OPEN', $res->json('data.win_loss'));
    }

    #[DataProvider('statusDerivationProvider')]
    public function test_stage_and_win_loss_are_derived_from_status_customer(string $status, string $expectedStage, string $expectedWinLoss): void
    {
        $this->sales();
        $lead = Lead::create(['business_name' => 'Uji Derivasi', 'client_uuid' => (string) Str::uuid()]);

        $lead->update(['status_customer' => $status]);
        $fresh = $lead->fresh();

        $this->assertSame($expectedStage, $fresh->stage);
        $this->assertSame($expectedWinLoss, $fresh->win_loss);
    }

    public static function statusDerivationProvider(): array
    {
        return [
            'Prospek -> LEAD/OPEN' => [Lead::STATUS_PROSPEK, 'LEAD', 'OPEN'],
            'Brand Awareness -> LEAD/OPEN' => [Lead::STATUS_BRAND_AWARENESS, 'LEAD', 'OPEN'],
            'Sampling -> OPPORTUNITY/OPEN' => [Lead::STATUS_SAMPLING, 'OPPORTUNITY', 'OPEN'],
            'Quotation -> QUOTE/OPEN' => [Lead::STATUS_QUOTATION, 'QUOTE', 'OPEN'],
            'Win -> QUOTE/WIN' => [Lead::STATUS_WIN, 'QUOTE', 'WIN'],
            'Distribution -> QUOTE/WIN' => [Lead::STATUS_DISTRIBUTION, 'QUOTE', 'WIN'],
        ];
    }

    public function test_lose_keeps_the_stage_bucket_from_before_it_lost_not_a_lose_bucket(): void
    {
        $lead = Lead::create(['business_name' => 'Kalah di Sampling', 'client_uuid' => (string) Str::uuid()]);
        $lead->update(['status_customer' => Lead::STATUS_SAMPLING]);

        $lead->update(['status_customer' => Lead::STATUS_LOSE]);
        $fresh = $lead->fresh();

        $this->assertSame('LOSE', $fresh->win_loss);
        // Kalah di tahap Sampling (bucket OPPORTUNITY) tetap tercatat OPPORTUNITY, bukan bucket lain
        $this->assertSame('OPPORTUNITY', $fresh->stage);
        $this->assertNotNull($fresh->closed_at);
    }

    public function test_closed_at_follows_win_loss_and_clears_on_reopen(): void
    {
        $lead = Lead::create(['business_name' => 'Uji closed_at', 'client_uuid' => (string) Str::uuid()]);

        $lead->update(['status_customer' => Lead::STATUS_WIN]);
        $this->assertNotNull($lead->fresh()->closed_at);

        $lead->update(['status_customer' => Lead::STATUS_PROSPEK]);
        $this->assertNull($lead->fresh()->closed_at);
    }

    public function test_migration_backfills_legacy_stage_and_win_loss_correctly(): void
    {
        $path = 'database/migrations/2026_10_01_000001_add_status_customer_and_customer_link_to_leads.php';

        Artisan::call('migrate:rollback', ['--path' => $path, '--force' => true]);
        $this->assertFalse(Schema::hasColumn('leads', 'status_customer'));

        $user = User::factory()->create(['role' => 'sales', 'active' => true]);
        $mk = fn (string $name, string $stage, string $winLoss) => DB::table('leads')->insertGetId([
            'business_name' => $name, 'stage' => $stage, 'win_loss' => $winLoss, 'salesperson_id' => $user->id,
            'client_uuid' => (string) Str::uuid(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $lead = $mk('Legacy LEAD', 'LEAD', 'OPEN');
        $opp = $mk('Legacy OPPORTUNITY', 'OPPORTUNITY', 'OPEN');
        $quote = $mk('Legacy QUOTE', 'QUOTE', 'OPEN');
        $won = $mk('Legacy WON', 'QUOTE', 'WIN');
        $lost = $mk('Legacy LOST', 'OPPORTUNITY', 'LOSE');

        Artisan::call('migrate', ['--path' => $path, '--force' => true]);
        $this->assertTrue(Schema::hasColumn('leads', 'status_customer'));
        $this->assertTrue(Schema::hasColumn('leads', 'customer_id'));

        $statusOf = fn (int $id) => DB::table('leads')->find($id)->status_customer;
        $this->assertSame(Lead::STATUS_PROSPEK, $statusOf($lead));
        $this->assertSame(Lead::STATUS_SAMPLING, $statusOf($opp));
        $this->assertSame(Lead::STATUS_QUOTATION, $statusOf($quote));
        $this->assertSame(Lead::STATUS_WIN, $statusOf($won));
        $this->assertSame(Lead::STATUS_LOSE, $statusOf($lost));
    }
}