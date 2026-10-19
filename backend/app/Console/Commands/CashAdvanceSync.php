<?php

namespace App\Console\Commands;

use App\Services\CashAdvance\CashAdvanceSyncService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CashAdvanceSync extends Command
{
    protected $signature = 'cash-advance:sync {--since= : Hanya dokumen dengan ApplyDate sejak tanggal ini (YYYY-MM-DD)} {--dry-run : Hanya tampilkan baris dari sumber, tanpa membuat pemberitahuan}';

    protected $description = 'Buat pemberitahuan uang muka dari dokumen Cash Issue Impress Fund yang baru';

    public function handle(): int
    {
        $service = new CashAdvanceSyncService();

        try {
            if ($this->option('dry-run')) {
                return $this->preview($service);
            }

            $stats = $service->sync($this->option('since') ?: null);
        } catch (\Throwable $e) {
            Log::error('cash-advance:sync gagal: '.$e->getMessage());
            $this->error('Gagal: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->table(
            ['Dibaca', 'Notifikasi baru', 'Sudah ada', 'Terlalu lama', 'Tanpa penerima', 'Tidak valid'],
            [[$stats['fetched'], $stats['created'], $stats['duplicate'], $stats['old'], $stats['no_recipient'], $stats['invalid']]]
        );

        foreach ($stats['unmatched'] as $ref => $count) {
            $this->warn("Penerima \"{$ref}\" tidak cocok dengan pengguna aplikasi ({$count} dokumen).");
        }

        return self::SUCCESS;
    }

    /** Menampilkan baris dari sumber (maksimal 20) tanpa menulis apa pun ke database. */
    private function preview(CashAdvanceSyncService $service): int
    {
        $rows = $service->preview();
        $this->info('Sumber: '.config('cash_advance.source').' | baris diterima: '.count($rows));

        $this->table(
            ['Ref', 'Dokumen', 'Tanggal', 'Jumlah', 'Mata uang', 'Desk tujuan', 'Penerima'],
            array_map(fn ($r) => [
                $r['reference_num'], $r['legal_number'], $r['apply_date'], number_format((float) $r['amount'], 2, ',', '.'),
                $r['currency'], $r['cash_desk_to'], $r['recipient'] !== '' ? $r['recipient'] : '(kosong)',
            ], array_slice($rows, 0, 20))
        );

        return self::SUCCESS;
    }
}