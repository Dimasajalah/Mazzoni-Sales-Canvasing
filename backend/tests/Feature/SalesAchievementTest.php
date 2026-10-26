<?php

namespace Tests\Feature;

use App\Models\SalesAchievementRow;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class SalesAchievementTest extends TestCase
{
    use RefreshDatabase;

    private function csv(array $rows, array $header = ['periode', 'kode_sales', 'target', 'actual']): UploadedFile
    {
        $lines = [implode(',', $header)];
        foreach ($rows as $r) {
            $lines[] = implode(',', $r);
        }
        $content = implode("\r\n", $lines)."\r\n";

        return UploadedFile::fake()->createWithContent('achievement.csv', $content);
    }

    public function test_non_admin_supervisor_cannot_access_achievement_endpoints(): void
    {
        $sales = User::factory()->create(['role' => 'sales']);

        $this->actingAs($sales, 'sanctum')->getJson('/api/v1/marketing/achievement')->assertStatus(403);
        $this->actingAs($sales, 'sanctum')->getJson('/api/v1/marketing/achievement/template')->assertStatus(403);
        $this->actingAs($sales, 'sanctum')->postJson('/api/v1/marketing/achievement', [])->assertStatus(403);
    }

    public function test_admin_uploads_a_valid_csv_and_rows_are_stored(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $sales = User::factory()->create(['role' => 'sales', 'salesperson_code' => 'SLS01']);

        $file = $this->csv([
            ['2026-10', 'SLS01', '15000000', '12000000'],
        ]);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/marketing/achievement', ['file' => $file]);

        $res->assertOk();
        $this->assertSame('VALID', $res->json('data.status'));
        $this->assertSame(1, $res->json('data.total_rows'));

        $row = SalesAchievementRow::where('period', '2026-10')->where('salesperson_id', $sales->id)->first();
        $this->assertNotNull($row);
        $this->assertSame(15000000.0, (float) $row->target);
        $this->assertSame(12000000.0, (float) $row->actual);
    }

    public function test_unknown_kode_sales_is_rejected_and_nothing_is_saved(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $file = $this->csv([
            ['2026-10', 'TIDAK_ADA', '1000000', '500000'],
        ]);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/marketing/achievement', ['file' => $file]);

        $res->assertOk();
        $this->assertSame('REJECTED', $res->json('data.status'));
        $this->assertSame(0, SalesAchievementRow::count());
    }

    public function test_invalid_period_format_is_rejected(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        User::factory()->create(['role' => 'sales', 'salesperson_code' => 'SLS01']);

        $file = $this->csv([
            ['Oktober-2026', 'SLS01', '1000000', '500000'],
        ]);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/marketing/achievement', ['file' => $file]);

        $res->assertOk();
        $this->assertSame('REJECTED', $res->json('data.status'));
    }

    public function test_reupload_for_same_period_and_salesperson_replaces_old_row(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $sales = User::factory()->create(['role' => 'sales', 'salesperson_code' => 'SLS01']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/marketing/achievement', [
            'file' => $this->csv([['2026-10', 'SLS01', '10000000', '5000000']]),
        ])->assertOk();

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/marketing/achievement', [
            'file' => $this->csv([['2026-10', 'SLS01', '10000000', '9000000']]),
        ])->assertOk();

        $this->assertSame(1, SalesAchievementRow::where('period', '2026-10')->where('salesperson_id', $sales->id)->count());
        $row = SalesAchievementRow::where('period', '2026-10')->where('salesperson_id', $sales->id)->first();
        $this->assertSame(9000000.0, (float) $row->actual);
    }

    public function test_home_dashboard_shows_current_and_previous_period_for_logged_in_sales(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $sales = User::factory()->create(['role' => 'sales', 'salesperson_code' => 'SLS01']);

        $current = now()->format('Y-m');
        $last = now()->subMonth()->format('Y-m');

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/marketing/achievement', [
            'file' => $this->csv([
                [$current, 'SLS01', '20000000', '18000000'],
                [$last, 'SLS01', '20000000', '21000000'],
            ]),
        ])->assertOk();

        $res = $this->actingAs($sales, 'sanctum')->getJson('/api/v1/marketing/achievement/me');

        $res->assertOk();
        $this->assertSame($current, $res->json('data.actual.period'));
        $this->assertSame(18000000.0, (float) $res->json('data.actual.actual'));
        $this->assertSame(20000000.0, (float) $res->json('data.actual.target'));
        $this->assertSame($last, $res->json('data.last.period'));
        $this->assertSame(21000000.0, (float) $res->json('data.last.actual'));
    }

    public function test_sales_with_no_data_yet_sees_nulls_not_errors(): void
    {
        $sales = User::factory()->create(['role' => 'sales', 'salesperson_code' => 'SLS99']);

        $res = $this->actingAs($sales, 'sanctum')->getJson('/api/v1/marketing/achievement/me');

        $res->assertOk();
        $this->assertNull($res->json('data.actual.target'));
        $this->assertNull($res->json('data.last.actual'));
    }
}