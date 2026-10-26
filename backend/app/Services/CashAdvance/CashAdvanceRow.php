<?php
//backend/app/Services/CashAdvance/CashAdvanceRow.php
namespace App\Services\CashAdvance;

/** Menyeragamkan satu baris hasil BAQ MZN_CashAdvanceIssued menjadi bentuk tetap. */
class CashAdvanceRow
{
    /**
     * @param  array<string, mixed>  $raw
     * @param  array<string, array<int, string>>|null  $columns  pemetaan isian => daftar nama kolom kandidat
     * @return array<string, mixed>
     */
    public static function normalize(array $raw, ?array $columns = null): array
    {
        $columns ??= (array) config('cash_advance.columns', []);

        $lower = [];
        foreach ($raw as $key => $value) {
            $lower[strtolower((string) $key)] = $value;
        }

        $pick = function (string $field) use ($columns, $lower) {
            foreach ((array) ($columns[$field] ?? []) as $candidate) {
                $k = strtolower((string) $candidate);
                if (array_key_exists($k, $lower) && $lower[$k] !== null && $lower[$k] !== '') {
                    return $lower[$k];
                }
            }

            // Nama kolom Mobile App User ID bisa berbeda awalan antar BAQ: cari yang memuat namanya.
            if ($field === 'recipient') {
                foreach ($lower as $k => $value) {
                    if (str_contains((string) $k, 'mobileappuserid') && $value !== null && $value !== '') {
                        return $value;
                    }
                }
            }

            return null;
        };

        $date = $pick('apply_date');
        $reference = $pick('reference_num');

        return [
            'doc_key' => self::text($pick('doc_key')),
            'cash_desk_id' => self::text($pick('cash_desk_id')),
            'cash_desk_to' => self::text($pick('cash_desk_to')),
            'cash_desk_to_name' => self::text($pick('cash_desk_to_name')),
            'reference_num' => is_numeric($reference) ? (int) $reference : null,
            'legal_number' => self::text($pick('legal_number')),
            'apply_date' => $date ? substr((string) $date, 0, 10) : null,
            'amount' => (float) ($pick('amount') ?? 0),
            'currency' => strtoupper(self::text($pick('currency')) ?: 'IDR'),
            'recipient' => self::text($pick('recipient')),
        ];
    }

    private static function text(mixed $value): string
    {
        return trim((string) ($value ?? ''));
    }
}