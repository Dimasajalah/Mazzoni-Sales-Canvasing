<?php
//backend/app/Console/Commands/SyncCustomersFromEpicor.php
namespace App\Console\Commands;

use App\Models\Customer;
use App\Models\User;
use App\Services\Epicor\EpicorClient;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class SyncCustomersFromEpicor extends Command
{
    /**
     * php artisan epicor:sync-customers
     * php artisan epicor:sync-customers --dry-run
     */
    protected $signature = 'epicor:sync-customers {--dry-run : Tampilkan hasil tanpa menyimpan ke database}';

    protected $description = 'Sync data Customer dari Epicor BAQ zES_Customers ke tabel customers lokal';

    private const BAQ_ID = 'zIWCustomer';

    public function handle(EpicorClient $client): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $this->info('Mengambil data dari Epicor BAQ: ' . self::BAQ_ID);

        try {
            $rows = $client->getBaq(self::BAQ_ID);
        } catch (Throwable $e) {
            $this->error('Gagal mengambil data dari Epicor: ' . $e->getMessage());
            Log::error('SyncCustomersFromEpicor: gagal fetch BAQ', ['error' => $e->getMessage()]);

            return self::FAILURE;
        }

        $total = count($rows);
        $this->info("Diterima {$total} record dari Epicor.");

        if ($total === 0) {
            $this->warn('Tidak ada data untuk disinkronkan.');

            return self::SUCCESS;
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $unmatchedSalesReps = [];

        $bar = $this->output->createProgressBar($total);
        $bar->start();

        foreach ($rows as $row) {
            $customerCode = trim((string) ($row['Customer_CustID'] ?? ''));

            // Baris tanpa Customer ID dilewati — tidak ada natural key untuk sync
            if ($customerCode === '') {
                $skipped++;
                $bar->advance();
                continue;
            }

            $salespersonId = $this->resolveSalespersonId(
                $row['Customer_SalesRepCode'] ?? null,
                $row['SalesRep_Name'] ?? null,
                $unmatchedSalesReps
            );

            if ($salespersonId === null) {
                $existingRow = Customer::where('customer_code', $customerCode)->first();
                $salespersonId = $existingRow?->salesperson_id;
            }

            $address = collect([
                $row['Customer_Address1'] ?? null,
                $row['Customer_Address2'] ?? null,
                $row['Customer_Address3'] ?? null,
            ])->filter(fn ($line) => filled($line))->implode("\n");

            $attributes = [
                'name'                 => $row['Customer_Name'] ?? $customerCode,
                'address'              => $address ?: null,
                'city'                 => $row['Customer_City'] ?? null,
                'phone'                => $row['Customer_PhoneNum'] ?? null,
                'email'                => $row['Customer_EMailAddress'] ?: null,
                'salesperson_id'       => $salespersonId,
                'active'               => true,
                'credit_hold'          => (bool) ($row['Customer_CreditHold'] ?? false),
                'credit_limit'         => (float) ($row['Customer_CreditLimit'] ?? 0),
                'epicor_customer_num'  => $row['Customer_CustNum'] ?? null,
                'external_system'      => 'epicor',
                'external_id'          => $row['Customer_SysRowID'] ?? null,
                'sync_status'          => 'SYNCED',
                'last_sync_at'         => now(),
            ];

            if ($dryRun) {
                $this->newLine();
                $this->line("[{$customerCode}] " . json_encode($attributes, JSON_UNESCAPED_UNICODE));
                $bar->advance();
                continue;
            }

            $existing = Customer::where('customer_code', $customerCode)->first();

            Customer::updateOrCreate(
                ['customer_code' => $customerCode],
                $attributes
            );

            $existing ? $updated++ : $created++;
            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);

        if ($dryRun) {
            $this->info("Dry-run selesai. {$total} record diproses, {$skipped} dilewati (tanpa Customer ID).");

            return self::SUCCESS;
        }

        $this->info("Sync selesai: {$created} dibuat, {$updated} diperbarui, {$skipped} dilewati.");

        if (! empty($unmatchedSalesReps)) {
            $unique = array_unique($unmatchedSalesReps);
            $this->warn(
                'Sales rep tidak ditemukan di tabel users untuk kode: ' . implode(', ', $unique)
            );
            Log::warning('SyncCustomersFromEpicor: sales rep tidak ditemukan', ['codes' => $unique]);
        }

        return self::SUCCESS;
    }

    /**
     * Coba resolve salesperson_id lokal dari kode/nama sales rep Epicor.
     * Mengembalikan null (tanpa error) kalau tidak ketemu, dan mencatat kode yang tidak match.
     */
    private function resolveSalespersonId(?string $code, ?string $name, array &$unmatched): ?int
    {
        $code = trim((string) $code);
        $name = trim((string) $name);

        if ($code === '' && $name === '') {
            return null;
        }

        // Prioritas 1: cocokkan lewat kolom salesperson_code (harus sama persis dengan kode sales rep di Epicor)
        if ($code !== '') {
            $user = User::where('salesperson_code', $code)->first();
            if ($user) {
                return $user->id;
            }
        }

        // Fallback: cocokkan lewat nama (kurang akurat, hanya jaga-jaga)
        if ($name !== '') {
            $user = User::where('name', $name)->first();
            if ($user) {
                return $user->id;
            }
        }

        if ($code !== '') {
            $unmatched[] = $code;
        }

        return null;
    }
}