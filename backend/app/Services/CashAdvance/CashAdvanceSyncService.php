<?php
//backend/app/Services/CashAdvance/CashAdvanceSyncService.php
namespace App\Services\CashAdvance;

use App\Models\CashAdvanceNotification;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/** Membuat pemberitahuan uang muka dari dokumen Cash Issue (Impress Fund Cash Advance) yang baru. */
class CashAdvanceSyncService
{
    public function __construct(private readonly ?CashAdvanceSource $source = null)
    {
    }

    /**
     * @return array{fetched:int, created:int, duplicate:int, old:int, no_recipient:int, invalid:int, unmatched:array<string,int>}
     */
    public function sync(?string $since = null): array
    {
        $sinceDate = Carbon::parse(
            $since ?: (config('cash_advance.notify_since') ?: now()->subDays((int) config('cash_advance.default_lookback_days', 1))->toDateString())
        )->startOfDay();

        $stats = ['fetched' => 0, 'created' => 0, 'duplicate' => 0, 'old' => 0, 'no_recipient' => 0, 'invalid' => 0, 'unmatched' => []];

        foreach ($this->source()->fetch() as $row) {
            $stats['fetched']++;

            if (blank($row['doc_key'] ?? null) || (float) ($row['amount'] ?? 0) <= 0) {
                $stats['invalid']++;
                continue;
            }
            if (! empty($row['apply_date']) && Carbon::parse($row['apply_date'])->lt($sinceDate)) {
                $stats['old']++;
                continue;
            }
            if (blank($row['recipient'] ?? null)) {
                $stats['no_recipient']++;
                continue;
            }
            if (CashAdvanceNotification::where('doc_key', $row['doc_key'])->exists()) {
                $stats['duplicate']++;
                continue;
            }

            $user = $this->matchUser((string) $row['recipient']);
            if (! $user) {
                // Tidak dicatat: bila penggunanya baru dibuat, dokumen ini diproses pada sinkron berikutnya.
                $stats['unmatched'][$row['recipient']] = ($stats['unmatched'][$row['recipient']] ?? 0) + 1;
                continue;
            }

            try {
                CashAdvanceNotification::create([
                    'doc_key' => $row['doc_key'],
                    'user_id' => $user->id,
                    'recipient_ref' => $row['recipient'],
                    'cash_desk_id' => $row['cash_desk_id'] ?: null,
                    'cash_desk_to' => $row['cash_desk_to'] ?: null,
                    'cash_desk_to_name' => $row['cash_desk_to_name'] ?: null,
                    'reference_num' => $row['reference_num'] ?? null,
                    'legal_number' => $row['legal_number'] ?: null,
                    'apply_date' => $row['apply_date'] ?? null,
                    'amount' => $row['amount'],
                    'currency' => $row['currency'] ?: 'IDR',
                ]);
                $stats['created']++;
            } catch (UniqueConstraintViolationException) {
                $stats['duplicate']++; // sinkron lain menyelip di antara pemeriksaan dan penyimpanan
            }
        }

        if ($stats['unmatched']) {
            Log::warning('Cash advance: penerima tidak cocok dengan pengguna aplikasi', ['penerima' => $stats['unmatched']]);
        }

        return $stats;
    }

    /**
     * Baris dari sumber yang sudah dinormalkan, tanpa menulis apa pun (untuk memeriksa sambungan dan pemetaan kolom).
     *
     * @return array<int, array<string, mixed>>
     */
    public function preview(): array
    {
        return $this->source()->fetch();
    }

    private function source(): CashAdvanceSource
    {
        if ($this->source) {
            return $this->source;
        }

        return config('cash_advance.source') === 'epicor' ? new EpicorCashAdvanceSource() : new StagingCashAdvanceSource();
    }

    /** Mencocokkan Mobile App User ID dengan pengguna: kolom pertama (menurut config) yang ada dan cocok menang. */
    private function matchUser(string $ref): ?User
    {
        $needle = mb_strtolower(trim($ref));

        foreach ((array) config('cash_advance.user_match_columns', []) as $column) {
            if (! preg_match('/^[a-z_]+$/', (string) $column) || ! Schema::hasColumn('users', $column)) {
                continue;
            }

            $query = User::whereRaw('LOWER('.$column.') = ?', [$needle]);
            if (Schema::hasColumn('users', 'active')) {
                $query->where('active', true);
            }

            if ($user = $query->first()) {
                return $user;
            }
        }

        return null;
    }
}