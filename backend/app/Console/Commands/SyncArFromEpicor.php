<?php
// backend/app/Console/Commands/SyncArFromEpicor.php

namespace App\Console\Commands;

use App\Models\Customer;
use App\Services\AR\ArSyncPlanner;
use App\Services\AR\ArSyncWriter;
use App\Services\Epicor\EpicorClient;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

class SyncArFromEpicor extends Command
{
    /**
     * php artisan ar:sync                                   (hanya membaca dan meringkas)
     * php artisan ar:sync --file=storage\app\ar-baq.json    (baca dari berkas JSON, bukan dari Epicor)
     * php artisan ar:sync --invoice=10009                   (lihat pemetaan satu invoice)
     * php artisan ar:sync --apply                           (menulis ke database, dengan konfirmasi)
     */
    protected $signature = 'ar:sync
        {--file= : Baca hasil BAQ dari berkas JSON (mis. simpanan Postman) alih-alih memanggil Epicor}
        {--invoice= : Tampilkan pemetaan satu invoice Epicor (nomor invoice)}
        {--samples=20 : Batas baris customer baru yang dicetak}
        {--apply : Tulis ke database: buat customer minimal bila belum ada, lalu tambah atau perbarui invoice}
        {--force : Lewati pertanyaan konfirmasi saat --apply}';

    protected $description = 'Sinkronkan piutang dari BAQ BMT_AgingAR ke tabel invoices. Tanpa --apply hanya membaca dan meringkas.';

    private const BAQ_ID = 'BMT_AgingAR';

    private const GROUP_LABELS = [
        'ok' => 'Masuk ke /ar (posted, saldo > 0)',
        'credit_memo' => 'Tidak ikut: credit memo',
        'not_posted' => 'Tidak ikut: belum posted',
        'zero_balance' => 'Tidak ikut: saldo nol atau negatif',
        'malformed' => 'Tidak terbaca: kolom BAQ tidak sesuai dugaan',
    ];

    public function handle(EpicorClient $client, ArSyncPlanner $planner, ArSyncWriter $writer): int
    {
        $apply = (bool) $this->option('apply');
        $only = trim((string) $this->option('invoice'));

        if ($apply && $only !== '') {
            $this->error('--apply tidak boleh dipakai bersama --invoice: sinkronisasi sebagian akan menyesatkan.');

            return self::FAILURE;
        }

        $file = trim((string) $this->option('file'));

        if ($file !== '') {
            $this->info('Membaca hasil BAQ dari berkas: '.$file);
            $rows = $this->rowsFromFile($file);

            if ($rows === null) {
                return self::FAILURE;
            }
        } else {
            $this->info('Mengambil data dari Epicor BAQ: '.self::BAQ_ID);

            try {
                $rows = $client->getBaq(self::BAQ_ID);
            } catch (Throwable $e) {
                $this->error('Gagal mengambil data dari Epicor: '.$e->getMessage());
                Log::error('SyncArFromEpicor: gagal fetch BAQ', ['error' => $e->getMessage()]);

                return self::FAILURE;
            }
        }

        $fetched = count($rows);

        if ($fetched === 0) {
            $this->warn('BAQ tidak mengembalikan baris. Tidak ada yang ditulis.');

            return self::SUCCESS;
        }

        $firstRowKeys = array_keys($rows[0]);

        if ($only !== '') {
            $rows = array_values(array_filter(
                $rows,
                fn ($r) => (string) ($r['InvcHead_InvoiceNum'] ?? '') === $only
            ));

            if ($rows === []) {
                $this->warn("Invoice {$only} tidak ada di hasil BAQ ({$fetched} baris diterima).");

                return self::SUCCESS;
            }
        }

        $customers = $writer->customerMap();

        $duplicates = Customer::whereNotNull('epicor_customer_num')
            ->select('epicor_customer_num')
            ->groupBy('epicor_customer_num')
            ->havingRaw('count(*) > 1')
            ->pluck('epicor_customer_num');

        if ($duplicates->isNotEmpty()) {
            $this->warn('epicor_customer_num ganda di tabel customers: '.$duplicates->implode(', '));
        }

        $now = Carbon::now('Asia/Jakarta');
        $plan = $planner->planIncludingNewCustomers($rows, $customers, $now);

        $this->newLine();
        $this->info("Diterima {$fetched} baris, diproses {$plan['total_rows']}. Tanggal acuan (Asia/Jakarta): ".$now->toDateString());
        $this->info('Customer lokal dengan epicor_customer_num: '.count($customers));

        $groupRows = [];
        foreach (self::GROUP_LABELS as $key => $label) {
            $groupRows[] = [$label, $plan['groups'][$key]];
        }
        $this->table(['Kelompok', 'Baris'], $groupRows);

        if ($plan['groups']['malformed'] > 0) {
            $this->warn('Ada baris yang tidak terbaca. Kunci baris pertama dari BAQ: '.implode(', ', $firstRowKeys));
        }

        $this->newLine();
        $this->info('Isi /ar setelah sinkronisasi: Rp '.$this->rupiah($plan['total']));
        $this->table(
            ['Bucket', 'Saldo (Rp)'],
            array_map(fn (string $b) => [$b, $this->rupiah($plan['buckets'][$b])], ArSyncPlanner::BUCKETS)
        );
        $this->line("Invoice telat: {$plan['overdue_count']} | Customer dengan piutang: {$plan['customers_with_ar']} | Invoice berstatus hold (ikut masuk): {$plan['held_in_ok']}");

        $invoicesByRep = [];
        foreach ($plan['ok'] as $planned) {
            $repCode = $planned['sales_rep'] !== '' ? $planned['sales_rep'] : '(kosong)';
            $invoicesByRep[$repCode] = ($invoicesByRep[$repCode] ?? 0) + 1;
        }

        $this->newLine();
        $this->info('Kode Sales Rep Epicor pada invoice yang masuk:');
        $this->table(
            ['Sales Rep (Epicor)', 'Invoice', 'Pengguna aplikasi'],
            array_map(
                fn ($repCode, $count) => [
                    $repCode,
                    $count,
                    ($ownerId = $writer->ownerId($repCode === '(kosong)' ? '' : (string) $repCode)) !== null ? "pengguna id {$ownerId}" : '-',
                ],
                array_keys($invoicesByRep),
                array_values($invoicesByRep)
            )
        );

        if ($plan['new_customers'] !== []) {
            $limit = max(1, (int) $this->option('samples'));
            $this->newLine();
            $this->warn(count($plan['new_customers']).' customer Epicor belum ada di lokal. Dengan --apply dibuat sebagai customer minimal (pemilik diisi bila kode Sales Rep cocok dengan salesperson_code pengguna):');
            $this->table(
                ['CustNum', 'Cust. ID', 'Nama', 'Sales Rep', 'Pemilik lokal', 'Invoice', 'Saldo (Rp)'],
                array_map(
                    fn (array $u) => [
                        $u['cust_num'],
                        $u['cust_id'],
                        $u['name'],
                        $u['sales_rep'] !== '' ? $u['sales_rep'] : '(tidak ada di BAQ)',
                        ($owner = $writer->ownerId($u['sales_rep'])) !== null ? "pengguna id {$owner}" : '-',
                        $u['invoices'],
                        $this->rupiah($u['total']),
                    ],
                    array_slice($plan['new_customers'], 0, $limit)
                )
            );
            if (count($plan['new_customers']) > $limit) {
                $this->line('... dan '.(count($plan['new_customers']) - $limit).' customer lainnya.');
            }
        }

        if ($only !== '') {
            $this->newLine();
            $group = $plan['trace'][0]['group'] ?? 'tidak diketahui';
            $this->info("Invoice {$only}: kelompok '{$group}'");
            if ($plan['ok'] !== []) {
                $detail = $plan['ok'][0];
                if ($detail['customer_id'] < 0) {
                    $detail['customer_id'] = null;
                    $this->line('Customer belum ada di lokal; akan dibuat saat --apply.');
                }
                $this->line(json_encode($detail, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            }
        }

        if (! $apply) {
            $this->newLine();
            $this->info('Selesai. Tanpa --apply tidak ada yang ditulis atau dihapus di database.');

            return self::SUCCESS;
        }

        return $this->applyToDatabase($writer, $rows, $now, $plan);
    }

    private function applyToDatabase(ArSyncWriter $writer, array $rows, Carbon $now, array $plan): int
    {
        if ($plan['groups']['malformed'] > 0) {
            $this->error('Ada baris yang tidak terbaca, jadi tidak ada yang ditulis. Perbaiki sumbernya lebih dulu.');

            return self::FAILURE;
        }

        if ($plan['groups']['ok'] === 0) {
            $this->warn('Tidak ada invoice yang perlu ditulis.');

            return self::SUCCESS;
        }

        $question = sprintf(
            'Akan membuat %d customer minimal dan menambah atau memperbarui %d invoice (Rp %s). Invoice staging tidak disentuh dan tidak ada yang dihapus. Lanjut?',
            count($plan['new_customers']),
            $plan['groups']['ok'],
            $this->rupiah($plan['total'])
        );

        if (! $this->option('force') && ! $this->confirm($question, false)) {
            $this->warn('Dibatalkan. Tidak ada yang ditulis.');

            return self::SUCCESS;
        }

        try {
            $result = $writer->apply($rows, $now);
        } catch (Throwable $e) {
            $this->error('Gagal menulis, semua perubahan dibatalkan: '.$e->getMessage());
            Log::error('SyncArFromEpicor: gagal menulis', ['error' => $e->getMessage()]);

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Selesai menulis:');
        $this->table(['Hasil', 'Jumlah'], [
            ['Customer minimal dibuat', $result['customers_created']],
            ['Customer lokal ditautkan (kode sama)', $result['customers_linked']],
            ['Pemilik customer diisi (sebelumnya kosong)', $result['owners_filled']],
            ['Invoice ditambah', $result['invoices_created']],
            ['Invoice diperbarui', $result['invoices_updated']],
        ]);

        if ($result['unresolved_reps'] !== []) {
            $this->warn('Kode Sales Rep Epicor tanpa pengguna aplikasi (salesperson_code), customernya tetap tanpa pemilik: '.implode(', ', $result['unresolved_reps']));
        }

        if ($result['customer_conflicts'] !== []) {
            $this->warn('Dilewati, kode customer sudah tertaut ke customer Epicor lain: '.implode(', ', $result['customer_conflicts']));
        }

        if ($result['invoice_conflicts'] !== []) {
            $this->warn('Dilewati, nomor invoice sudah dipakai invoice lain yang bukan dari Epicor: '.implode(', ', $result['invoice_conflicts']));
        }

        return self::SUCCESS;
    }

    /**
     * Baca hasil BAQ dari berkas JSON (bentuk OData: {"value": [ ...baris... ]} atau daftar baris langsung).
     *
     * @return array<int, array<string, mixed>>|null  null bila berkas tidak bisa dipakai (galat sudah dicetak)
     */
    private function rowsFromFile(string $path): ?array
    {
        if (! is_file($path)) {
            $this->error("Berkas tidak ditemukan: {$path}");

            return null;
        }

        $json = (string) file_get_contents($path);
        $json = (string) preg_replace('/^\xEF\xBB\xBF/', '', $json); // buang BOM bila ada
        $decoded = json_decode($json, true);

        if (! is_array($decoded)) {
            $this->error('Isi berkas bukan JSON yang valid: '.json_last_error_msg());

            return null;
        }

        $rows = $decoded['value'] ?? $decoded;

        if (! is_array($rows) || ! isset($rows[0]) || ! is_array($rows[0])) {
            $this->error("Bentuk JSON tidak dikenali: harus berisi \"value\" berupa daftar baris.");

            return null;
        }

        return array_values($rows);
    }

    private function rupiah(float $value): string
    {
        return number_format($value, 0, ',', '.');
    }
}