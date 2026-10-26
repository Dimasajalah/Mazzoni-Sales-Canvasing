<?php
//backend/tests/feature/CashAdvanceNotificationTest.php
namespace Tests\Feature;

use App\Models\CashAdvanceNotification;
use App\Models\User;
use App\Services\CashAdvance\CashAdvanceRow;
use App\Services\CashAdvance\CashAdvanceSource;
use App\Services\CashAdvance\CashAdvanceSyncService;
use App\Services\CashAdvance\StagingCashAdvanceSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Petty Cash tahap 2: sales hanya diberi tahu jumlah uang muka yang diberikan (Cash Issue Impress Fund). */
class CashAdvanceNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cash_advance.user_match_columns' => ['email']]);
    }

    private function user(string $email): User
    {
        return User::factory()->create(['email' => $email, 'active' => true]);
    }

    /** @param array<int, array<string, mixed>> $rows */
    private function source(array $rows): CashAdvanceSource
    {
        return new class($rows) implements CashAdvanceSource
        {
            public function __construct(private array $rows)
            {
            }

            public function fetch(): array
            {
                return $this->rows;
            }
        };
    }

    /** @param array<string, mixed> $over */
    private function row(array $over = []): array
    {
        return array_merge([
            'doc_key' => 'doc-1', 'cash_desk_id' => 'UJFIN', 'cash_desk_to' => 'UJIMP', 'cash_desk_to_name' => 'UJI MJU - Impress Fund',
            'reference_num' => 25, 'legal_number' => 'MJ1-202610-0011', 'apply_date' => '2026-10-12', 'amount' => 400000.0,
            'currency' => 'IDR', 'recipient' => 'sales1@example.test',
        ], $over);
    }

    public function test_a_new_cash_issue_notifies_the_matching_user_with_the_amount(): void
    {
        $user = $this->user('sales1@example.test');

        $stats = (new CashAdvanceSyncService($this->source([$this->row()])))->sync('2026-10-01');

        $this->assertSame(1, $stats['created']);
        $n = CashAdvanceNotification::firstOrFail();
        $this->assertSame($user->id, $n->user_id);
        $this->assertSame('400000.00', (string) $n->amount);
        $this->assertSame('MJ1-202610-0011', $n->legal_number);
        $this->assertNull($n->read_at);
    }

    public function test_the_recipient_is_matched_case_insensitively(): void
    {
        $this->user('Sales1@Example.Test');

        $stats = (new CashAdvanceSyncService($this->source([$this->row()])))->sync('2026-10-01');

        $this->assertSame(1, $stats['created']);
    }

    public function test_running_the_sync_again_does_not_create_duplicates(): void
    {
        $this->user('sales1@example.test');
        $service = new CashAdvanceSyncService($this->source([$this->row()]));

        $service->sync('2026-10-01');
        $second = $service->sync('2026-10-01');

        $this->assertSame(0, $second['created']);
        $this->assertSame(1, $second['duplicate']);
        $this->assertSame(1, CashAdvanceNotification::count());
    }

    public function test_documents_older_than_the_since_date_are_not_notified(): void
    {
        $this->user('sales1@example.test');
        $rows = [$this->row(['doc_key' => 'old', 'apply_date' => '2026-10-01']), $this->row(['doc_key' => 'new', 'apply_date' => '2026-10-12'])];

        $stats = (new CashAdvanceSyncService($this->source($rows)))->sync('2026-10-05');

        $this->assertSame(1, $stats['created']);
        $this->assertSame(1, $stats['old']);
        $this->assertSame(['new'], CashAdvanceNotification::pluck('doc_key')->all());
    }

    public function test_a_recipient_without_an_app_user_creates_nothing_and_is_retried_once_the_user_exists(): void
    {
        $service = new CashAdvanceSyncService($this->source([$this->row()]));

        $first = $service->sync('2026-10-01');
        $this->assertSame(0, $first['created']);
        $this->assertSame(['sales1@example.test' => 1], $first['unmatched']);

        $this->user('sales1@example.test');
        $this->assertSame(1, $service->sync('2026-10-01')['created']);
    }

    public function test_documents_without_a_recipient_or_amount_are_skipped(): void
    {
        $this->user('sales1@example.test');
        $rows = [
            $this->row(['doc_key' => 'a', 'recipient' => '']),
            $this->row(['doc_key' => 'b', 'amount' => 0.0]),
            $this->row(['doc_key' => '']),
        ];

        $stats = (new CashAdvanceSyncService($this->source($rows)))->sync('2026-10-01');

        $this->assertSame(0, $stats['created']);
        $this->assertSame(1, $stats['no_recipient']);
        $this->assertSame(2, $stats['invalid']);
    }

    public function test_epicor_baq_rows_are_normalized_whatever_the_column_case(): void
    {
        $row = CashAdvanceRow::normalize([
            'PCashDoc_SysRowID' => '46ad096e-cc20-41b1-9444-d674f19b4c82', 'PCashDoc_CashDeskID' => 'UJFIN', 'PCashDoc_ReferenceNum' => 25,
            'PCashDoc_LegalNumber' => 'MJ1-202610-0011', 'PCashDoc_ApplyDate' => '2026-10-12T00:00:00', 'PCashDoc_CashAmt' => 400000,
            'PCashDoc_CurrencyCode' => 'idr', 'PCashDoc_CashDeskIDTransfer' => 'UJIMP', 'DeskTo_Name' => 'UJI MJU - Impress Fund',
            'deskto_mobileappuserid_c' => ' manager ',
        ]);

        $this->assertSame('46ad096e-cc20-41b1-9444-d674f19b4c82', $row['doc_key']);
        $this->assertSame('2026-10-12', $row['apply_date']);
        $this->assertSame(400000.0, $row['amount']);
        $this->assertSame('IDR', $row['currency']);
        $this->assertSame('UJIMP', $row['cash_desk_to']);
        $this->assertSame('manager', $row['recipient']);
        $this->assertSame(25, $row['reference_num']);
    }

    public function test_the_recipient_column_is_found_even_with_an_unexpected_prefix(): void
    {
        $row = CashAdvanceRow::normalize(['PCashDoc_SysRowID' => 'k', 'Desk2_MobileAppUserID_c' => 'budi']);

        $this->assertSame('budi', $row['recipient']);
    }

    public function test_the_staging_source_returns_the_three_documents_from_the_baq_test(): void
    {
        config(['cash_advance.staging_recipient' => null]);

        $rows = (new StagingCashAdvanceSource())->fetch();

        $this->assertCount(3, $rows);
        $this->assertSame(['manager'], array_values(array_unique(array_column($rows, 'recipient'))));
        $this->assertSame(400000.0, $rows[2]['amount']);
        $this->assertSame('UJIMP', $rows[0]['cash_desk_to']);
    }

    public function test_the_staging_recipient_can_be_overridden_for_manual_testing(): void
    {
        config(['cash_advance.staging_recipient' => 'sales1@example.test']);
        $this->user('sales1@example.test');

        $stats = (new CashAdvanceSyncService(new StagingCashAdvanceSource()))->sync('2026-10-01');

        $this->assertSame(3, $stats['created']);
    }

    public function test_preview_returns_the_rows_without_creating_notifications(): void
    {
        $this->user('sales1@example.test');

        $rows = (new CashAdvanceSyncService($this->source([$this->row()])))->preview();

        $this->assertCount(1, $rows);
        $this->assertSame('sales1@example.test', $rows[0]['recipient']);
        $this->assertSame(0, CashAdvanceNotification::count());
    }

    public function test_the_list_returns_only_my_notifications_with_the_unread_count(): void
    {
        $me = $this->user('sales1@example.test');
        $other = $this->user('sales2@example.test');
        $make = fn (User $u, string $key, ?string $read = null) => CashAdvanceNotification::create([
            'doc_key' => $key, 'user_id' => $u->id, 'recipient_ref' => $u->email, 'amount' => 100000, 'apply_date' => '2026-10-12',
            'legal_number' => 'L-'.$key, 'read_at' => $read,
        ]);
        $make($me, 'a');
        $make($me, 'b', now()->toDateTimeString());
        $make($other, 'c');
        Sanctum::actingAs($me);

        $r = $this->getJson('/api/v1/cash-advance/notifications')->assertOk();

        $this->assertSame(1, $r->json('data.unread'));
        $this->assertCount(2, $r->json('data.items'));
        $this->assertNotContains('L-c', array_column($r->json('data.items'), 'legal_number'));
    }

    public function test_marking_one_notification_as_read_lowers_the_unread_count(): void
    {
        $me = $this->user('sales1@example.test');
        $n = CashAdvanceNotification::create(['doc_key' => 'a', 'user_id' => $me->id, 'recipient_ref' => 'x', 'amount' => 1]);
        Sanctum::actingAs($me);

        $this->postJson("/api/v1/cash-advance/notifications/{$n->id}/read")->assertOk();

        $this->assertNotNull($n->fresh()->read_at);
        $this->assertSame(0, $this->getJson('/api/v1/cash-advance/notifications')->json('data.unread'));
    }

    public function test_someone_elses_notification_cannot_be_marked_as_read(): void
    {
        $me = $this->user('sales1@example.test');
        $other = $this->user('sales2@example.test');
        $n = CashAdvanceNotification::create(['doc_key' => 'a', 'user_id' => $other->id, 'recipient_ref' => 'x', 'amount' => 1]);
        Sanctum::actingAs($me);

        $this->postJson("/api/v1/cash-advance/notifications/{$n->id}/read")->assertStatus(404);

        $this->assertNull($n->fresh()->read_at);
    }

    public function test_read_all_marks_only_my_notifications(): void
    {
        $me = $this->user('sales1@example.test');
        $other = $this->user('sales2@example.test');
        CashAdvanceNotification::create(['doc_key' => 'a', 'user_id' => $me->id, 'recipient_ref' => 'x', 'amount' => 1]);
        CashAdvanceNotification::create(['doc_key' => 'b', 'user_id' => $me->id, 'recipient_ref' => 'x', 'amount' => 1]);
        CashAdvanceNotification::create(['doc_key' => 'c', 'user_id' => $other->id, 'recipient_ref' => 'x', 'amount' => 1]);
        Sanctum::actingAs($me);

        $this->postJson('/api/v1/cash-advance/notifications/read-all')->assertOk();

        $this->assertSame(0, CashAdvanceNotification::where('user_id', $me->id)->whereNull('read_at')->count());
        $this->assertSame(1, CashAdvanceNotification::where('user_id', $other->id)->whereNull('read_at')->count());
    }

    public function test_the_endpoints_require_login(): void
    {
        $this->getJson('/api/v1/cash-advance/notifications')->assertStatus(401);
    }
}