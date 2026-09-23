<?php
// backend/app/Console/Commands/EpicorTestConnection.php
namespace App\Console\Commands;

use App\Services\Epicor\EpicorClient;
use Illuminate\Console\Command;
use Throwable;

class EpicorTestConnection extends Command
{
    /**
     * php artisan epicor:test-connection
     * php artisan epicor:test-connection --baq=zES_Customers
     * php artisan epicor:test-connection --baq=zCashHead --limit=3
     */
    protected $signature = 'epicor:test-connection
                            {--baq=zES_Customers : Nama BAQ yang mau dites}
                            {--limit=5 : Jumlah record yang ditampilkan}';

    protected $description = 'Test koneksi ke Epicor REST API dan tampilkan sample data dari sebuah BAQ';

    public function handle(EpicorClient $client): int
    {
        $baq = $this->option('baq');
        $limit = (int) $this->option('limit');

        $this->info("Menghubungi Epicor...");
        $this->line("  Base URL : " . config('services.epicor.base_url'));
        $this->line("  Company  : " . config('services.epicor.company'));
        $this->line("  BAQ      : {$baq}");
        $this->newLine();

        try {
            $start = microtime(true);
            $data = $client->getBaq($baq);
            $elapsed = round((microtime(true) - $start) * 1000);

            $count = count($data);

            $this->info("✔ Berhasil! {$count} record diterima ({$elapsed} ms).");
            $this->newLine();

            if ($count === 0) {
                $this->warn('BAQ berhasil dipanggil tapi tidak ada data yang dikembalikan.');
                return self::SUCCESS;
            }

            // Tampilkan sample record pertama secara utuh (semua field)
            $this->line('--- Sample record pertama (field lengkap) ---');
            foreach ($data[0] as $field => $value) {
                $this->line(sprintf('  %-35s => %s', $field, is_null($value) ? 'null' : $value));
            }
            $this->newLine();

            // Tampilkan beberapa record dalam bentuk tabel ringkas (kolom pertama saja biar tidak kepanjangan)
            $previewKeys = array_slice(array_keys($data[0]), 0, 5);
            $rows = array_map(function ($row) use ($previewKeys) {
                return array_map(fn ($k) => $row[$k] ?? '-', $previewKeys);
            }, array_slice($data, 0, $limit));

            $this->line("--- Preview {$limit} record pertama (5 kolom pertama) ---");
            $this->table($previewKeys, $rows);

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error('✘ Gagal menghubungi Epicor.');
            $this->newLine();
            $this->line('Pesan error:');
            $this->line('  ' . $e->getMessage());
            $this->newLine();
            $this->warn('Cek kembali: EPICOR_BASE_URL, EPICOR_COMPANY, EPICOR_USERNAME, EPICOR_PASSWORD, EPICOR_API_KEY di .env');

            return self::FAILURE;
        }
    }
}