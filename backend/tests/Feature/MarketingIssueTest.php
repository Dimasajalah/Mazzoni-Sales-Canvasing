<?php
namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\MarketingIssue;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Blueprint MJU 3.2.17 / MKT17: Issue Miscellaneous Material.
 * Permintaan User (langkah 01) di luar sistem; Marketing mencatat Issue Misc. Material (02) lalu Remarks (03).
 */
class MarketingIssueTest extends TestCase
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

    private function url(string $path = ''): string
    {
        return '/api/v1/marketing/issues'.($path ? "/{$path}" : '');
    }

    private function payload(array $over = []): array
    {
        $this->parts();

        return $over + [
            'issue_reference' => 'ISS-2026-0001', 'requester_name' => 'Bu Rina (Sales Surabaya)', 'notes' => 'Permintaan lewat WhatsApp',
            'items' => [['part_num' => 'P-001', 'qty' => 12, 'description' => 'Sample saus'], ['part_num' => 'P-002', 'qty' => 2.5]],
        ];
    }

    private function createIssue(array $over = []): int
    {
        return $this->postJson($this->url(), $this->payload($over))->assertStatus(201)->json('data.id');
    }

    private function finish(int $id, array $over = [])
    {
        return $this->postJson($this->url("{$id}/complete"), $over + [
            'recipient_type' => 'SALES', 'recipient_name' => 'Budi Santoso', 'purpose' => 'Dibagikan ke calon pelanggan',
        ]);
    }

    public function test_marketing_records_the_issue_misc_material_with_its_document_number_and_items(): void
    {
        $this->actAs('supervisor', ['name' => 'Bu Marketing']);

        $r = $this->postJson($this->url(), $this->payload())->assertStatus(201);

        $this->assertSame('IS-'.now()->format('Y').'-00001', $r->json('data.issue_no'));
        $this->assertSame('ISSUED', $r->json('data.status'));
        $this->assertSame('ISS-2026-0001', $r->json('data.issue_reference'));
        $this->assertSame('Bu Rina (Sales Surabaya)', $r->json('data.requester_name'));
        $this->assertSame('Bu Marketing', $r->json('data.creator.name'));
        $this->assertSame(['P-001', 'P-002'], array_column($r->json('data.items'), 'part_num'));
        $this->assertEquals([12, 2.5], array_column($r->json('data.items'), 'qty'));
        $this->assertTrue($r->json('data.flags.can_edit'));
        $this->assertTrue($r->json('data.flags.can_complete'));
        $this->assertStringContainsString('nama sales atau customer', $r->json('data.awaiting_label'));
        $this->assertSame(['SALES', 'CUSTOMER'], array_column($r->json('data.recipient_types'), 'value'));
        $this->assertSame('IS-'.now()->format('Y').'-00002', $this->postJson($this->url(), $this->payload())->json('data.issue_no'));
    }

    public function test_the_requester_is_optional_because_the_request_itself_happens_outside_the_system(): void
    {
        $this->actAs('supervisor');

        $r = $this->postJson($this->url(), $this->payload(['requester_name' => '   ', 'notes' => null]))->assertStatus(201);

        $this->assertNull($r->json('data.requester_name'));
        $this->assertNull($r->json('data.notes'));
    }

    public function test_the_document_number_and_items_are_validated(): void
    {
        $this->actAs('supervisor');

        $this->postJson($this->url(), $this->payload(['issue_reference' => '']))->assertStatus(422);
        $this->postJson($this->url(), $this->payload(['items' => []]))->assertStatus(422);
        $this->postJson($this->url(), $this->payload(['items' => [['part_num' => 'P-001', 'qty' => 0]]]))->assertStatus(422);
        $this->postJson($this->url(), $this->payload(['items' => [['part_num' => 'P-001', 'qty' => 1], ['part_num' => 'p-001', 'qty' => 2]]]))->assertStatus(422); // kode ganda
        $unknown = $this->postJson($this->url(), $this->payload(['items' => [['part_num' => 'TIDAK-ADA', 'qty' => 1]]]))->assertStatus(422);
        $this->assertStringContainsString('tidak ada di Part Master', $unknown->json('message'));
        $this->assertSame(0, MarketingIssue::count());
    }

    public function test_the_issue_can_be_corrected_until_the_remarks_are_filled(): void
    {
        $this->actAs('supervisor');
        $id = $this->createIssue();

        $r = $this->putJson($this->url((string) $id), $this->payload(['issue_reference' => 'ISS-2026-0099', 'items' => [['part_num' => 'P-002', 'qty' => 7]]]))->assertOk();
        $this->assertSame('ISS-2026-0099', $r->json('data.issue_reference'));
        $this->assertSame(['P-002'], array_column($r->json('data.items'), 'part_num')); // diganti, bukan ditambah

        $this->finish($id)->assertOk();
        $this->putJson($this->url((string) $id), $this->payload())->assertStatus(422);
        $this->assertSame('ISS-2026-0099', MarketingIssue::find($id)->issue_reference);
    }

    public function test_the_sales_name_and_purpose_become_the_remarks(): void
    {
        $this->actAs('supervisor');
        $id = $this->createIssue();

        $r = $this->finish($id, ['recipient_name' => ' Budi Santoso ', 'purpose' => ' Dibagikan ke calon pelanggan '])->assertOk();

        $this->assertSame('DONE', $r->json('data.status'));
        $this->assertSame('SALES', $r->json('data.recipient_type'));
        $this->assertSame('Sales', $r->json('data.recipient_type_label'));
        $this->assertSame('Budi Santoso', $r->json('data.recipient_name'));
        $this->assertSame('Dibagikan ke calon pelanggan', $r->json('data.purpose'));
        $this->assertSame('Budi Santoso (Sales) / Dibagikan ke calon pelanggan', $r->json('data.remarks'));
        $this->assertNull($r->json('data.awaiting_label'));
        $this->assertFalse($r->json('data.flags.can_complete'));
        $this->assertFalse($r->json('data.flags.can_edit'));
        $this->finish($id)->assertStatus(422); // tidak bisa dua kali
    }

    public function test_a_customer_can_be_the_recipient_too(): void
    {
        $this->actAs('supervisor');
        $id = $this->createIssue();

        $r = $this->finish($id, ['recipient_type' => 'CUSTOMER', 'recipient_name' => 'Toko Maju Jaya', 'purpose' => 'Display di toko'])->assertOk();

        $this->assertSame('Toko Maju Jaya (Customer) / Display di toko', $r->json('data.remarks'));
    }

    public function test_the_recipient_type_name_and_purpose_are_required(): void
    {
        $this->actAs('supervisor');
        $id = $this->createIssue();

        $this->postJson($this->url("{$id}/complete"), [])->assertStatus(422);
        $this->finish($id, ['recipient_type' => 'DISTRIBUTOR'])->assertStatus(422);  // jenis tidak dikenal
        $this->finish($id, ['recipient_name' => ''])->assertStatus(422);
        $this->finish($id, ['purpose' => '   '])->assertStatus(422);
        $this->assertSame('ISSUED', MarketingIssue::find($id)->status);
    }

    public function test_the_list_shows_the_newest_first_and_can_be_searched(): void
    {
        $this->actAs('supervisor');
        $first = $this->createIssue(['issue_reference' => 'ISS-ALFA']);
        $second = $this->createIssue(['issue_reference' => 'ISS-BETA', 'items' => [['part_num' => 'P-001', 'qty' => 1]]]);
        $this->finish($first, ['recipient_name' => 'Citra Dewi'])->assertOk();

        $r = $this->getJson($this->url())->assertOk();

        $this->assertSame([$second, $first], array_column($r->json('data'), 'id'));
        $this->assertSame([1, 2], array_column($r->json('data'), 'items_count'));
        $this->assertSame([true, false], array_column($r->json('data'), 'can_act')); // hanya yang belum diisi Remarks
        $this->assertSame([$second], array_column($this->getJson($this->url().'?q=BETA')->json('data'), 'id'));
        $this->assertSame([$first], array_column($this->getJson($this->url().'?q=Citra')->json('data'), 'id'));
        $this->assertSame([$first], array_column($this->getJson($this->url().'?q='.MarketingIssue::find($first)->issue_no)->json('data'), 'id'));
        $this->assertCount(0, $this->getJson($this->url().'?q=tidak-ada')->json('data'));
    }

    public function test_only_marketing_can_use_issue_and_the_roles_come_from_the_config(): void
    {
        $this->actAs('supervisor');
        $id = $this->createIssue();

        foreach (['sales', 'finance', 'warehouse'] as $role) {
            $this->actAs($role);
            $this->getJson($this->url())->assertStatus(403);
            $this->getJson($this->url((string) $id))->assertStatus(403);
            $this->postJson($this->url(), $this->payload())->assertStatus(403);
            $this->finish($id)->assertStatus(403);
        }
        $this->assertSame(1, MarketingIssue::count());

        config(['marketing.issue_material.roles' => ['warehouse']]);
        $this->actAs('warehouse');
        $this->finish($id)->assertOk();
        $this->actAs('supervisor');
        $this->getJson($this->url())->assertStatus(403);
    }

    public function test_every_step_is_written_to_the_audit_log(): void
    {
        $this->actAs('supervisor');
        $id = $this->createIssue();
        $this->putJson($this->url((string) $id), $this->payload())->assertOk();
        $this->finish($id)->assertOk();

        foreach (['create', 'update', 'complete'] as $step) {
            $this->assertTrue(AuditLog::where('action', "marketing_issue.{$step}")->where('entity_id', $id)->exists(), $step);
        }
    }

    public function test_the_endpoints_require_login_and_unknown_issues_return_404(): void
    {
        $this->getJson($this->url())->assertStatus(401);
        $this->getJson($this->url('1'))->assertStatus(401);
        $this->postJson($this->url(), [])->assertStatus(401);
        $this->postJson($this->url('1/complete'), [])->assertStatus(401);

        $this->actAs('supervisor');
        $this->getJson($this->url('999'))->assertStatus(404);
        $this->putJson($this->url('999'), $this->payload())->assertStatus(404);
        $this->finish(999)->assertStatus(404);
    }
}