<?php
// backend/app/Services/AR/ArSyncWriter.php

namespace App\Services\AR;

use App\Models\Customer;
use App\Models\Invoice;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * Menulis hasil BAQ BMT_AgingAR ke tabel customers dan invoices.
 *
 * Aturan:
 * - Semua penulisan dalam satu transaksi: gagal di tengah berarti tidak ada yang berubah.
 * - Invoice dikunci lewat epicor_invoice_num, jadi aman dijalankan berulang.
 * - Tidak ada yang dihapus dan invoice tanpa epicor_invoice_num (staging) tidak disentuh.
 * - Customer Epicor yang belum ada di lokal dibuat minimal.
 * - Pemilik customer (salesperson_id) diambil dari kolom Customer_SalesRepCode di BAQ, dicocokkan dengan
 *   users.salesperson_code (aturan yang sama dengan epicor:sync-customers). Pemilik yang sudah terisi
 *   tidak pernah ditimpa; hanya customer tanpa pemilik yang diisi.
 * - days_overdue dan aging_bucket tidak disimpan: keduanya dihitung dari due_date oleh model.
 */
class ArSyncWriter
{
    /** @var array<string, int|null> cache kode Sales Rep -> id pengguna */
    private array $owners = [];

    public function __construct(private ArSyncPlanner $planner)
    {
    }

    /**
     * @return array<string, array{id:int, customer_code:string, salesperson_id:?int}>  dikunci epicor_customer_num
     */
    public function customerMap(): array
    {
        return Customer::whereNotNull('epicor_customer_num')
            ->get(['id', 'customer_code', 'epicor_customer_num', 'salesperson_id'])
            ->mapWithKeys(fn ($c) => [(string) $c->epicor_customer_num => [
                'id' => (int) $c->id,
                'customer_code' => (string) $c->customer_code,
                'salesperson_id' => $c->salesperson_id === null ? null : (int) $c->salesperson_id,
            ]])
            ->all();
    }

    /** Id pengguna aplikasi yang salesperson_code-nya sama persis dengan kode Sales Rep Epicor, atau null. */
    public function ownerId(string $salesRep): ?int
    {
        $code = trim($salesRep);

        if ($code === '') {
            return null;
        }

        if (! array_key_exists($code, $this->owners)) {
            $id = User::where('salesperson_code', $code)->value('id');
            $this->owners[$code] = $id === null ? null : (int) $id;
        }

        return $this->owners[$code];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows  baris BAQ
     * @return array<string, mixed>
     */
    public function apply(array $rows, CarbonInterface $now): array
    {
        return DB::transaction(function () use ($rows, $now) {
            $result = [
                'customers_created' => 0,
                'customers_linked' => 0,
                'customer_conflicts' => [],
                'owners_filled' => 0,
                'unresolved_reps' => [],
                'invoices_created' => 0,
                'invoices_updated' => 0,
                'invoice_conflicts' => [],
            ];
            $unresolved = [];

            $plan = $this->planner->plan($rows, $this->customerMap(), $now);

            foreach ($plan['unmatched'] as $new) {
                $outcome = $this->ensureCustomer($new);

                if ($outcome === 'conflict') {
                    $result['customer_conflicts'][] = $new['cust_id'] !== '' ? $new['cust_id'] : 'EPICOR-'.$new['cust_num'];
                } elseif ($outcome === 'linked') {
                    $result['customers_linked']++;
                } else {
                    $result['customers_created']++;
                }
            }

            // Petakan ulang supaya customer yang baru dibuat atau ditautkan ikut terbaca.
            $plan = $this->planner->plan($rows, $this->customerMap(), $now);

            $checkedOwners = [];

            foreach ($plan['ok'] as $invoice) {
                $this->fillOwner((int) $invoice['customer_id'], (string) $invoice['sales_rep'], $checkedOwners, $unresolved, $result);

                $attributes = [
                    'invoice_number' => $invoice['invoice_number'],
                    'customer_id' => $invoice['customer_id'],
                    'invoice_date' => $invoice['invoice_date'],
                    'due_date' => $invoice['due_date'],
                    'invoice_amount' => $invoice['invoice_amount'],
                    'paid_amount' => $invoice['paid_amount'],
                    'balance' => $invoice['balance'],
                    'status' => 'OPEN',
                    'sync_status' => 'SYNCED',
                ];

                $existing = Invoice::where('epicor_invoice_num', $invoice['epicor_invoice_num'])->first();

                if ($existing) {
                    $existing->forceFill($attributes)->save();
                    $result['invoices_updated']++;
                    continue;
                }

                // Nomor yang sama sudah dipakai invoice lain yang bukan dari Epicor: jangan ditimpa.
                if (Invoice::where('invoice_number', $invoice['invoice_number'])->exists()) {
                    $result['invoice_conflicts'][] = $invoice['invoice_number'];
                    continue;
                }

                (new Invoice())->forceFill($attributes + [
                    'epicor_invoice_num' => $invoice['epicor_invoice_num'],
                    'sales_order_id' => null,
                ])->save();
                $result['invoices_created']++;
            }

            $result['unresolved_reps'] = array_map('strval', array_keys($unresolved));
            $result['plan'] = $plan;

            return $result;
        });
    }

    /**
     * Isi pemilik customer yang masih kosong dari kode Sales Rep Epicor. Pemilik yang sudah ada tidak ditimpa.
     * Kode yang tidak cocok dengan pengguna mana pun dicatat di $unresolved.
     */
    private function fillOwner(int $customerId, string $salesRep, array &$checked, array &$unresolved, array &$result): void
    {
        $salesRep = trim($salesRep);

        if ($salesRep === '' || isset($checked[$customerId])) {
            return;
        }
        $checked[$customerId] = true;

        $customer = Customer::find($customerId);

        if (! $customer || $customer->salesperson_id !== null) {
            return;
        }

        $ownerId = $this->ownerId($salesRep);

        if ($ownerId === null) {
            $unresolved[$salesRep] = true;

            return;
        }

        $customer->forceFill(['salesperson_id' => $ownerId])->save();
        $result['owners_filled']++;
    }

    /**
     * @param  array{cust_num:string, cust_id:string, name:string, sales_rep:string}  $new
     * @return string  'created' | 'linked' | 'conflict'
     */
    private function ensureCustomer(array $new): string
    {
        // Kode Epicor dipakai apa adanya sebagai customer_code, sama dengan kunci epicor:sync-customers,
        // sehingga sinkronisasi customer berikutnya memperbarui baris yang sama, bukan membuat ganda.
        $code = $new['cust_id'] !== '' ? $new['cust_id'] : 'EPICOR-'.$new['cust_num'];

        $existing = Customer::where('customer_code', $code)->first();

        if ($existing) {
            if (! blank($existing->epicor_customer_num)) {
                return 'conflict'; // kode sama, tetapi sudah tertaut ke customer Epicor lain
            }

            $existing->forceFill(['epicor_customer_num' => $new['cust_num']])->save();

            return 'linked';
        }

        (new Customer())->forceFill([
            'customer_code' => $code,
            'name' => $new['name'] !== '' ? $new['name'] : $code,
            'active' => true,
            'credit_hold' => false,
            'credit_limit' => 0, // placeholder; nilai sebenarnya diisi epicor:sync-customers
            'salesperson_id' => $this->ownerId($new['sales_rep']),
            'epicor_customer_num' => $new['cust_num'],
            'external_system' => 'epicor',
            'sync_status' => 'SYNCED',
            'last_sync_at' => now(),
        ])->save();

        return 'created';
    }
}