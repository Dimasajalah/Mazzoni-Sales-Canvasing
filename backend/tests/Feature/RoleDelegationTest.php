<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadDelegation;
use App\Models\Notification;
use App\Models\Product;
use App\Models\Quote;
use App\Models\SalesOrder;
use App\Models\TaskSet;
use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Tahap 7: peran Sales Dealmaker / Sales Order, delegasi, laporan NOO, dan manajemen user. */
class RoleDelegationTest extends TestCase
{
    use RefreshDatabase;

    private function mk(string $role, ?string $type = null, array $extra = []): User
    {
        return User::factory()->create(array_merge([
            'role' => $role, 'sales_type' => $type ?? 'ORDER', 'active' => true, 'territory' => 'Surabaya',
        ], $extra));
    }

    private function dealmaker(array $extra = []): User
    {
        return $this->mk('sales', 'DEALMAKER', $extra);
    }

    private function orderSales(array $extra = []): User
    {
        return $this->mk('sales', 'ORDER', $extra);
    }

    private function login(User $u): User
    {
        Sanctum::actingAs($u->fresh());

        return $u;
    }

    private function product(float $price = 1000): Product
    {
        return Product::create([
            'part_num' => 'P-'.uniqid(), 'description' => 'Saus Tomat 1kg', 'uom' => 'PCS', 'price' => $price,
            'epicor_part_num' => 'EP-'.uniqid(), 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    private function customer(User $owner, string $code = 'C-R-1'): Customer
    {
        return Customer::create([
            'customer_code' => $code, 'name' => 'PT '.$code, 'city' => 'Surabaya',
            'salesperson_id' => $owner->id, 'active' => true, 'sync_status' => 'NOT_REQUIRED',
        ]);
    }

    private function tpl(int $seq): int
    {
        return TaskTemplate::where('seq', $seq)
            ->where('task_set_id', TaskSet::where('code', 'B2B')->firstOrFail()->id)->firstOrFail()->id;
    }

    /** Lead B2B baru milik user yang sedang login. */
    private function newLead(string $name = 'UD Uji'): array
    {
        return $this->postJson('/api/v1/leads', [
            'business_name' => $name, 'ktp' => '3578010101900001',
            'task_set_id' => TaskSet::where('code', 'B2B')->firstOrFail()->id,
        ])->assertCreated()->json('data');
    }

    /** Alur lengkap sebagai pemilik: lead -> tugas 1 (Lanjut) -> isi penawaran -> Win. Mengembalikan [lead, quoteId]. */
    private function winnedLeadWithQuote(Product $p): array
    {
        $lead = $this->newLead('Prospek Menang');
        $next = $this->postJson("/api/v1/lead-tasks/{$lead['current_task']['id']}/conclude", [
            'conclusion' => 'NEXT', 'next_template_id' => $this->tpl(30), // Poin 7: Quotation sekarang seq 30
        ])->assertOk();
        $quoteId = $next->json('data.quote.id');

        $this->putJson("/api/v1/quotes/{$quoteId}/lines", ['lines' => [
            ['product_id' => $p->id, 'gramasi_gr' => 100, 'qty_kg' => 10],
        ]])->assertOk();

        $this->postJson("/api/v1/lead-tasks/{$next->json('data.next_task.id')}/conclude", ['conclusion' => 'WIN'])->assertOk();

        return [$lead, $quoteId];
    }

    // ------------------------------------------------------------------ peran

    public function test_me_exposes_role_capabilities(): void
    {
        $this->login($this->dealmaker());
        $this->getJson('/api/v1/auth/me')->assertOk()
            ->assertJsonPath('data.sales_type', 'DEALMAKER')
            ->assertJsonPath('data.can_order', false)
            ->assertJsonPath('data.can_delegate', true);

        $this->login($this->orderSales());
        $this->getJson('/api/v1/auth/me')
            ->assertJsonPath('data.can_order', true)
            ->assertJsonPath('data.can_delegate', false);

        $this->login($this->mk('admin'));
        $this->getJson('/api/v1/auth/me')
            ->assertJsonPath('data.can_order', true)
            ->assertJsonPath('data.can_delegate', true);
    }

    public function test_dealmaker_cannot_create_orders_but_sales_order_and_admin_can(): void
    {
        $p = $this->product();
        $dm = $this->dealmaker();
        $cust = $this->customer($dm);
        $payload = ['customer_id' => $cust->id, 'lines' => [['product_id' => $p->id, 'qty' => 2]]];

        $this->login($dm);
        $this->postJson('/api/v1/orders', $payload)->assertForbidden()
            ->assertJsonPath('message', fn ($m) => str_contains($m, 'Dealmaker'));
        $this->assertSame(0, SalesOrder::count());

        $this->login($this->orderSales());
        $this->postJson('/api/v1/orders', $payload)->assertCreated();

        $this->login($this->mk('admin'));
        $this->postJson('/api/v1/orders', $payload)->assertCreated();
        $this->assertSame(2, SalesOrder::count());
    }

    public function test_dealmaker_can_still_do_quotes_samples_and_read_orders(): void
    {
        $p = $this->product();
        $this->login($this->dealmaker());

        $this->postJson('/api/v1/quotes', ['lines' => [['product_id' => $p->id, 'gramasi_gr' => 100, 'qty_kg' => 5]]])->assertCreated();
        $this->getJson('/api/v1/orders')->assertOk();
    }

    public function test_dealmaker_cannot_convert_a_quote_to_an_order(): void
    {
        $p = $this->product();
        $dm = $this->login($this->dealmaker());
        $cust = $this->customer($dm);
        $qid = $this->postJson('/api/v1/quotes', [
            'customer_id' => $cust->id,
            'lines' => [['product_id' => $p->id, 'gramasi_gr' => 100, 'qty_kg' => 5]],
        ])->json('data.id');

        $this->postJson("/api/v1/quotes/{$qid}/convert-to-order", [])->assertForbidden();
        $this->assertSame(0, SalesOrder::count());
        $this->assertNotSame('WON', Quote::find($qid)->status);
    }

    public function test_order_on_a_lead_requires_ownership_or_delegation(): void
    {
        $p = $this->product();
        $owner = $this->login($this->orderSales());
        $cust = $this->customer($owner);
        $lead = $this->newLead();

        $payload = ['customer_id' => $cust->id, 'lead_id' => $lead['id'], 'lines' => [['product_id' => $p->id, 'qty' => 1]]];

        // sales lain tidak boleh menandai Win prospek milik orang lain lewat order
        $this->login($this->orderSales());
        $this->postJson('/api/v1/orders', $payload)->assertForbidden();
        $this->assertSame('OPEN', Lead::find($lead['id'])->win_loss);

        // pemilik boleh
        $this->login($owner);
        $this->postJson('/api/v1/orders', $payload)->assertCreated();
        $this->assertSame('WIN', Lead::find($lead['id'])->win_loss);
    }

    // ------------------------------------------------------------------ delegasi

    public function test_dealmaker_delegates_a_won_lead_and_history_is_kept(): void
    {
        $p = $this->product();
        $dm = $this->login($this->dealmaker());
        [$lead] = $this->winnedLeadWithQuote($p);
        $toni = $this->orderSales(['name' => 'Toni']);
        $sari = $this->orderSales(['name' => 'Sari']);

        $this->postJson("/api/v1/leads/{$lead['id']}/delegate", ['to_user_id' => $toni->id, 'note' => 'Tolong diorder'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'PENDING')
            ->assertJsonPath('data.to.name', 'Toni')
            ->assertJsonPath('data.lead.business_name', 'Prospek Menang')
            ->assertJsonPath('data.quote.status', 'WON');

        $this->assertSame($dm->id, Lead::find($lead['id'])->salesperson_id); // NOO tetap milik pembuka
        $this->assertTrue(LeadActivity::where('lead_id', $lead['id'])->where('activity_type', 'DELEGATED')->exists());
        $note = Notification::where('user_id', $toni->id)->where('type', 'DELEGATION')->first();
        $this->assertNotNull($note);
        $this->assertSame($lead['id'], $note->data['lead_id']);

        // mengganti tujuan: delegasi lama menjadi CANCELLED, riwayat tetap ada
        $this->postJson("/api/v1/leads/{$lead['id']}/delegate", ['to_user_id' => $sari->id])->assertCreated();
        $this->assertSame(['CANCELLED', 'PENDING'], LeadDelegation::where('lead_id', $lead['id'])->orderBy('id')->pluck('status')->all());

        $this->getJson("/api/v1/leads/{$lead['id']}/delegation")->assertOk()->assertJsonPath('data.to.name', 'Sari');
    }

    public function test_delegation_validation_rules(): void
    {
        $p = $this->product();
        $dm = $this->login($this->dealmaker());
        $open = $this->newLead('Belum Win');
        [$won] = $this->winnedLeadWithQuote($p);
        $order = $this->orderSales();

        // lead belum Win
        $this->postJson("/api/v1/leads/{$open['id']}/delegate", ['to_user_id' => $order->id])
            ->assertStatus(422)->assertJsonValidationErrors('lead');

        // tujuan harus Sales Order aktif
        $other = $this->dealmaker();
        $inactive = $this->orderSales(['active' => false]);
        foreach ([$other, $inactive, $this->mk('admin'), $this->mk('finance')] as $bad) {
            $this->postJson("/api/v1/leads/{$won['id']}/delegate", ['to_user_id' => $bad->id])
                ->assertStatus(422)->assertJsonValidationErrors('to_user_id');
        }
        $this->postJson("/api/v1/leads/{$won['id']}/delegate", ['to_user_id' => 99999])->assertStatus(422);
        $this->postJson("/api/v1/leads/{$won['id']}/delegate", [])->assertStatus(422);
        $this->assertSame(0, LeadDelegation::count());
    }

    public function test_only_dealmaker_owner_or_managers_can_delegate(): void
    {
        $p = $this->product();
        $dm = $this->login($this->dealmaker());
        [$lead] = $this->winnedLeadWithQuote($p);
        $target = $this->orderSales();
        $body = ['to_user_id' => $target->id];

        // Sales Order tidak bisa mendelegasikan (walau pemilik lead)
        $ownerOrder = $this->login($this->orderSales());
        $ownLead = $this->newLead('Milik Sales Order');
        $this->postJson("/api/v1/leads/{$ownLead['id']}/delegate", $body)->assertForbidden();
        $this->getJson('/api/v1/delegation-targets')->assertForbidden();

        // Dealmaker lain tidak bisa mendelegasikan prospek yang bukan miliknya
        $this->login($this->dealmaker());
        $this->postJson("/api/v1/leads/{$lead['id']}/delegate", $body)->assertForbidden();

        // supervisor boleh mengatur ulang
        $this->login($this->mk('supervisor'));
        $this->postJson("/api/v1/leads/{$lead['id']}/delegate", $body)->assertCreated();

        // daftar tujuan: hanya Sales Order yang aktif (bukan Dealmaker, admin, maupun yang nonaktif)
        $inactive = $this->orderSales(['active' => false]);
        $this->login($dm);
        $ids = collect($this->getJson('/api/v1/delegation-targets')->assertOk()->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($target->id));
        $this->assertTrue($ids->contains($ownerOrder->id));
        $this->assertFalse($ids->contains($dm->id));
        $this->assertFalse($ids->contains($inactive->id));
    }

    public function test_cancel_delegation_rules(): void
    {
        $p = $this->product();
        $dm = $this->login($this->dealmaker());
        [$lead] = $this->winnedLeadWithQuote($p);
        $to = $this->orderSales();
        $id = $this->postJson("/api/v1/leads/{$lead['id']}/delegate", ['to_user_id' => $to->id])->json('data.id');

        $this->login($to);
        $this->postJson("/api/v1/delegations/{$id}/cancel")->assertForbidden(); // penerima bukan pembuat

        $this->login($dm);
        $this->postJson("/api/v1/delegations/{$id}/cancel")->assertOk()->assertJsonPath('data.status', 'CANCELLED');
        $this->postJson("/api/v1/delegations/{$id}/cancel")->assertStatus(422); // sudah dibatalkan
        $this->postJson('/api/v1/delegations/99999/cancel')->assertNotFound();
    }

    public function test_delegation_lists_are_scoped_per_user(): void
    {
        $p = $this->product();
        $dm = $this->login($this->dealmaker());
        [$lead] = $this->winnedLeadWithQuote($p);
        $to = $this->orderSales();
        $this->postJson("/api/v1/leads/{$lead['id']}/delegate", ['to_user_id' => $to->id])->assertCreated();

        $this->getJson('/api/v1/delegations?direction=outgoing')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/delegations?direction=incoming')->assertOk()->assertJsonCount(0, 'data');

        $this->login($to);
        $inc = $this->getJson('/api/v1/delegations?direction=incoming')->assertOk()->assertJsonCount(1, 'data');
        $inc->assertJsonPath('data.0.lead.business_name', 'Prospek Menang')
            ->assertJsonPath('data.0.from.id', $dm->id)
            ->assertJsonPath('data.0.quote.status', 'WON');
        // data pribadi prospek tidak ikut terkirim
        $this->assertArrayNotHasKey('ktp', $inc->json('data.0.lead'));

        $this->login($this->orderSales()); // orang lain tidak melihat apa pun
        $this->getJson('/api/v1/delegations')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/leads/{$lead['id']}/delegation")->assertForbidden();

        $this->login($this->mk('supervisor'));
        $this->getJson('/api/v1/delegations')->assertOk()->assertJsonCount(1, 'data');

        // dashboard menampilkan hitungan
        $this->login($to);
        $this->getJson('/api/v1/dashboard')->assertOk()->assertJsonPath('data.delegations.incoming_pending', 1);
    }

    public function test_recipient_converts_the_delegated_quote_into_an_order(): void
    {
        $p = $this->product(2000);
        $dm = $this->login($this->dealmaker());
        [$lead, $quoteId] = $this->winnedLeadWithQuote($p);
        $to = $this->orderSales();
        $stranger = $this->orderSales();
        $cust = $this->customer($to, 'C-DELEG');
        $delegationId = $this->postJson("/api/v1/leads/{$lead['id']}/delegate", ['to_user_id' => $to->id])->json('data.id');

        // orang lain tidak bisa melihat / mengonversi
        $this->login($stranger);
        $this->getJson("/api/v1/quotes/{$quoteId}")->assertForbidden();
        $this->postJson("/api/v1/quotes/{$quoteId}/convert-to-order", ['customer_id' => $cust->id])->assertForbidden();

        // penerima boleh melihat tetapi tidak mengubah penawaran
        $this->login($to);
        $this->getJson("/api/v1/quotes/{$quoteId}")->assertOk();
        $this->patchJson("/api/v1/quotes/{$quoteId}", ['terms' => 'x'])->assertForbidden();

        $res = $this->postJson("/api/v1/quotes/{$quoteId}/convert-to-order", ['customer_id' => $cust->id])->assertCreated();
        $orderId = $res->json('data.order.id');

        $this->assertSame($to->id, SalesOrder::find($orderId)->salesperson_id);   // order atas nama penerima
        $this->assertSame($dm->id, Lead::find($lead['id'])->salesperson_id);      // NOO tetap milik Dealmaker
        $d = LeadDelegation::find($delegationId);
        $this->assertSame('ORDERED', $d->status);
        $this->assertSame($orderId, $d->order_id);
        $this->assertNotNull($d->completed_at);

        // sudah jadi order: tidak bisa didelegasikan lagi
        $this->login($dm);
        $this->postJson("/api/v1/leads/{$lead['id']}/delegate", ['to_user_id' => $to->id])->assertStatus(422);
    }

    public function test_recipient_can_order_the_delegated_lead_directly_but_not_after_it_is_cancelled(): void
    {
        $p = $this->product();
        $dm = $this->login($this->dealmaker());
        [$lead] = $this->winnedLeadWithQuote($p);
        $to = $this->orderSales();
        $cust = $this->customer($to, 'C-DIRECT');
        $id = $this->postJson("/api/v1/leads/{$lead['id']}/delegate", ['to_user_id' => $to->id])->json('data.id');
        $payload = ['customer_id' => $cust->id, 'lead_id' => $lead['id'], 'lines' => [['product_id' => $p->id, 'qty' => 3]]];

        $this->postJson("/api/v1/delegations/{$id}/cancel")->assertOk();
        $this->login($to);
        $this->postJson('/api/v1/orders', $payload)->assertForbidden();   // delegasi dibatalkan

        $this->login($dm);
        $this->postJson("/api/v1/leads/{$lead['id']}/delegate", ['to_user_id' => $to->id])->assertCreated();
        $this->login($to);
        $this->postJson('/api/v1/orders', $payload)->assertCreated();
        $this->assertSame('ORDERED', LeadDelegation::where('lead_id', $lead['id'])->latest('id')->value('status'));
    }

    // ------------------------------------------------------------------ hook lead

    public function test_closed_at_follows_win_loss_and_territory_is_a_snapshot(): void
    {
        $user = $this->login($this->orderSales(['territory' => 'Malang']));
        $lead = $this->newLead();
        $model = Lead::find($lead['id']);

        $this->assertNull($model->closed_at);
        $this->assertSame('Malang', $model->territory);

        $model->update(['win_loss' => 'WIN']);
        $this->assertNotNull($model->fresh()->closed_at);

        $model->update(['win_loss' => 'OPEN']);
        $this->assertNull($model->fresh()->closed_at);

        // pindah territory tidak mengubah histori lead
        $user->update(['territory' => 'Sidoarjo']);
        $this->assertSame('Malang', $model->fresh()->territory);
    }

    // ------------------------------------------------------------------ laporan NOO

    private function seedNoo(): array
    {
        $a = $this->orderSales(['name' => 'Andi', 'territory' => 'Surabaya']);
        $b = $this->dealmaker(['name' => 'Bella', 'territory' => 'Malang']);
        $p = $this->product();

        $mk = function (User $u, string $win, ?string $closed, string $registered = '2026-09-10') {
            return Lead::create([
                'business_name' => 'L-'.uniqid(), 'ktp' => '1', 'salesperson_id' => $u->id, 'territory' => $u->territory,
                'stage' => 'LEAD', 'win_loss' => $win, 'closed_at' => $closed, 'register_date' => $registered,
                'client_uuid' => (string) \Illuminate\Support\Str::uuid(),
            ]);
        };

        $aWon1 = $mk($a, 'WIN', '2026-09-12 10:00:00');
        $mk($a, 'WIN', '2026-09-20 10:00:00');
        $mk($a, 'LOSE', '2026-09-15 10:00:00');
        $mk($a, 'OPEN', null, '2026-09-11');
        $mk($b, 'WIN', '2026-09-14 10:00:00');
        $mk($b, 'WIN', '2026-08-30 10:00:00', '2026-08-01');   // di luar periode
        $mk($b, 'LOSE', '2026-09-16 10:00:00');
        $mk($b, 'LOSE', '2026-09-17 10:00:00');

        // salah satu Win Andi sudah punya order
        $this->login($a);
        $cust = $this->customer($a, 'C-NOO');
        $this->postJson('/api/v1/orders', ['customer_id' => $cust->id, 'lead_id' => $aWon1->id, 'lines' => [['product_id' => $p->id, 'qty' => 1]]])->assertCreated();

        return [$a, $b];
    }

    public function test_noo_report_by_sales_with_period_and_win_rate(): void
    {
        [$a, $b] = $this->seedNoo();
        $this->login($this->mk('supervisor'));

        $res = $this->getJson('/api/v1/reports/noo?from=2026-09-01&to=2026-09-30&group_by=sales')->assertOk();
        $rows = collect($res->json('data.rows'))->keyBy('label');

        $this->assertSame(4, $rows['Andi']['registered']);
        $this->assertSame(2, $rows['Andi']['won']);
        $this->assertSame(1, $rows['Andi']['lost']);
        $this->assertSame(1, $rows['Andi']['ordered']);
        $this->assertEquals(66.7, $rows['Andi']['win_rate']);

        $this->assertSame(1, $rows['Bella']['won']);            // Win 30 Agustus di luar periode
        $this->assertSame(2, $rows['Bella']['lost']);
        $this->assertSame(0, $rows['Bella']['ordered']);

        $res->assertJsonPath('data.totals.won', 3)->assertJsonPath('data.totals.lost', 3)
            ->assertJsonPath('data.period.from', '2026-09-01')->assertJsonPath('data.group_by', 'sales');
        $this->assertSame('Andi', $res->json('data.rows.0.label')); // urut dari NOO terbanyak

        // periode Agustus: hanya Win Bella yang lama
        $aug = $this->getJson('/api/v1/reports/noo?from=2026-08-01&to=2026-08-31')->assertOk();
        $this->assertSame(1, $aug->json('data.totals.won'));
        $this->assertSame('Bella', $aug->json('data.rows.0.label'));
        $this->assertEquals(100.0, $aug->json('data.rows.0.win_rate'));   // 1 Win, 0 Lose
    }

    public function test_noo_report_by_territory_and_filters(): void
    {
        [$a, $b] = $this->seedNoo();
        $this->login($this->mk('supervisor'));

        $res = $this->getJson('/api/v1/reports/noo?from=2026-09-01&to=2026-09-30&group_by=territory')->assertOk();
        $rows = collect($res->json('data.rows'))->keyBy('label');
        $this->assertSame(2, $rows['Surabaya']['won']);
        $this->assertSame(1, $rows['Malang']['won']);

        $one = $this->getJson('/api/v1/reports/noo?from=2026-09-01&to=2026-09-30&group_by=territory&territory=Malang')->assertOk();
        $this->assertSame(['Malang'], collect($one->json('data.rows'))->pluck('label')->all());

        $sp = $this->getJson("/api/v1/reports/noo?from=2026-09-01&to=2026-09-30&salesperson_id={$b->id}")->assertOk();
        $this->assertSame(['Bella'], collect($sp->json('data.rows'))->pluck('label')->all());
    }

    public function test_sales_only_sees_own_noo_and_delegated_orders_still_count_to_the_opener(): void
    {
        [$a, $b] = $this->seedNoo();

        $this->login($a);
        $mine = $this->getJson('/api/v1/reports/noo?from=2026-09-01&to=2026-09-30')->assertOk();
        $this->assertSame(['Andi'], collect($mine->json('data.rows'))->pluck('label')->all());
        // sales tidak bisa mengintip sales lain lewat filter
        $peek = $this->getJson("/api/v1/reports/noo?from=2026-09-01&to=2026-09-30&salesperson_id={$b->id}")->assertOk();
        $this->assertSame(['Andi'], collect($peek->json('data.rows'))->pluck('label')->all());

        // order lewat delegasi tidak memindahkan NOO
        $this->login($b);
        $lead = Lead::create([
            'business_name' => 'Delegasi NOO', 'ktp' => '1', 'salesperson_id' => $b->id, 'territory' => $b->territory,
            'stage' => 'QUOTE', 'win_loss' => 'WIN', 'closed_at' => '2026-09-18 09:00:00', 'register_date' => '2026-09-05',
            'client_uuid' => (string) \Illuminate\Support\Str::uuid(),
        ]);
        $receiver = $this->orderSales(['name' => 'Penerima']);
        $this->postJson("/api/v1/leads/{$lead->id}/delegate", ['to_user_id' => $receiver->id])->assertCreated();
        $this->login($receiver);
        $cust = $this->customer($receiver, 'C-RCV');
        $this->postJson('/api/v1/orders', ['customer_id' => $cust->id, 'lead_id' => $lead->id, 'lines' => [['product_id' => $this->product()->id, 'qty' => 1]]])->assertCreated();

        $this->login($this->mk('supervisor'));
        $rows = collect($this->getJson('/api/v1/reports/noo?from=2026-09-01&to=2026-09-30')->json('data.rows'))->keyBy('label');
        $this->assertSame(2, $rows['Bella']['won']);
        $this->assertSame(1, $rows['Bella']['ordered']);
        $this->assertArrayNotHasKey('Penerima', $rows->all());
    }

    public function test_noo_report_validation_and_default_period(): void
    {
        $this->login($this->mk('supervisor'));

        $this->getJson('/api/v1/reports/noo?from=2026-09-10&to=2026-09-01')->assertStatus(422)->assertJsonValidationErrors('to');
        $this->getJson('/api/v1/reports/noo?group_by=produk')->assertStatus(422)->assertJsonValidationErrors('group_by');

        $res = $this->getJson('/api/v1/reports/noo')->assertOk();
        $this->assertSame(now()->startOfMonth()->toDateString(), $res->json('data.period.from'));
        $this->assertSame([], $res->json('data.rows'));
        $res->assertJsonPath('data.totals.registered', 0)->assertJsonPath('data.totals.win_rate', null);
    }

    // ------------------------------------------------------------------ manajemen user

    public function test_user_admin_access_and_creation_rules(): void
    {
        $this->login($this->orderSales());
        $this->getJson('/api/v1/users')->assertForbidden();

        $this->login($this->mk('supervisor'));
        $this->getJson('/api/v1/users')->assertOk();
        $this->postJson('/api/v1/users', [])->assertForbidden(); // supervisor hanya membaca

        $this->login($this->mk('admin'));
        $base = ['name' => 'Sales Baru', 'username' => 'sales.baru', 'email' => 'baru@x.local', 'password' => 'rahasia123', 'role' => 'sales'];

        // sales wajib memilih Dealmaker / Sales Order
        $this->postJson('/api/v1/users', $base)->assertStatus(422)->assertJsonValidationErrors('sales_type');
        $this->postJson('/api/v1/users', $base + ['sales_type' => 'BOSS'])->assertStatus(422)->assertJsonValidationErrors('sales_type');
        $this->postJson('/api/v1/users', array_merge($base, ['password' => 'pendek', 'sales_type' => 'DEALMAKER']))
            ->assertStatus(422)->assertJsonValidationErrors('password');

        $created = $this->postJson('/api/v1/users', $base + ['sales_type' => 'DEALMAKER', 'territory' => 'Gresik'])->assertCreated();
        $created->assertJsonPath('data.sales_type', 'DEALMAKER')->assertJsonPath('data.territory', 'Gresik');
        $this->assertArrayNotHasKey('password', $created->json('data'));

        // username / email unik
        $this->postJson('/api/v1/users', $base + ['sales_type' => 'ORDER'])->assertStatus(422)->assertJsonValidationErrors(['username', 'email']);

        // role selain sales: tipe dinormalkan
        $fin = $this->postJson('/api/v1/users', ['name' => 'Fin', 'username' => 'fin', 'email' => 'fin@x.local', 'password' => 'rahasia123', 'role' => 'finance'])->assertCreated();
        $fin->assertJsonPath('data.sales_type', 'ORDER');

        // user baru bisa login dan langsung terkena pembatasan Dealmaker
        $this->postJson('/api/v1/auth/login', ['login' => 'sales.baru', 'password' => 'rahasia123'])
            ->assertOk()->assertJsonPath('data.user.can_order', false);
    }

    public function test_user_admin_update_guards(): void
    {
        $admin = $this->login($this->mk('admin'));
        $target = $this->orderSales();

        $this->patchJson("/api/v1/users/{$target->id}", ['sales_type' => 'DEALMAKER', 'territory' => 'Gresik'])
            ->assertOk()->assertJsonPath('data.sales_type', 'DEALMAKER');
        $this->assertFalse($target->fresh()->canOrder());

        // tidak boleh mengunci diri sendiri
        $this->patchJson("/api/v1/users/{$admin->id}", ['role' => 'sales', 'sales_type' => 'ORDER'])->assertStatus(422);
        $this->patchJson("/api/v1/users/{$admin->id}", ['active' => false])->assertStatus(422);
        $this->patchJson('/api/v1/users/99999', ['name' => 'x'])->assertNotFound();

        // penerima delegasi yang masih menunggu tidak boleh berhenti menjadi Sales Order
        $dm = $this->dealmaker();
        $recipient = $this->orderSales();
        $lead = Lead::create([
            'business_name' => 'Tertahan', 'ktp' => '1', 'salesperson_id' => $dm->id, 'stage' => 'QUOTE', 'win_loss' => 'WIN',
            'register_date' => now()->toDateString(), 'client_uuid' => (string) \Illuminate\Support\Str::uuid(),
        ]);
        LeadDelegation::create(['lead_id' => $lead->id, 'from_user_id' => $dm->id, 'to_user_id' => $recipient->id, 'status' => 'PENDING', 'delegated_at' => now()]);

        $this->patchJson("/api/v1/users/{$recipient->id}", ['sales_type' => 'DEALMAKER'])->assertStatus(422);
        $this->patchJson("/api/v1/users/{$recipient->id}", ['active' => false])->assertStatus(422);
        $this->patchJson("/api/v1/users/{$recipient->id}", ['territory' => 'Baru'])->assertOk(); // perubahan lain tetap boleh
        $this->assertSame('ORDER', $recipient->fresh()->sales_type);
    }
}
