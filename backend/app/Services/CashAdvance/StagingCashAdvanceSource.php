<?php

namespace App\Services\CashAdvance;

/**
 * Data contoh yang meniru keluaran BAQ MZN_CashAdvanceIssued (tiga dokumen nyata dari hasil Test di Epicor).
 * Untuk uji, atur CASH_ADVANCE_STAGING_RECIPIENT supaya penerimanya login Anda sendiri,
 * atau taruh daftar baris BAQ di storage/app/cash_advance_staging.json.
 */
class StagingCashAdvanceSource implements CashAdvanceSource
{
    public function fetch(): array
    {
        $rows = $this->rawRows();
        $override = (string) config('cash_advance.staging_recipient', '');

        return array_map(function (array $raw) use ($override) {
            $row = CashAdvanceRow::normalize($raw);
            if ($override !== '') {
                $row['recipient'] = $override;
            }

            return $row;
        }, $rows);
    }

    /** @return array<int, array<string, mixed>> */
    private function rawRows(): array
    {
        $file = storage_path('app/cash_advance_staging.json');
        if (is_file($file)) {
            $decoded = json_decode((string) file_get_contents($file), true);
            if (is_array($decoded)) {
                return array_values(array_filter($decoded, 'is_array'));
            }
        }

        $base = [
            'PCashDoc_CashDeskID' => 'UJFIN',
            'PCashDoc_CurrencyCode' => 'IDR',
            'PCashDoc_CashDeskIDTransfer' => 'UJIMP',
            'DeskTo_Name' => 'UJI MJU - Impress Fund',
            'DeskTo_MobileAppUserID_c' => 'manager',
        ];

        return [
            $base + [
                'PCashDoc_SysRowID' => 'c67b4a6a-d7d0-44fd-a2cb-597b16843747', 'PCashDoc_ReferenceNum' => 15,
                'PCashDoc_LegalNumber' => 'MJ1-202610-0001', 'PCashDoc_ApplyDate' => '2026-10-09T00:00:00', 'PCashDoc_CashAmt' => 3350000,
            ],
            $base + [
                'PCashDoc_SysRowID' => '592855c9-6996-46b9-96d8-7f1f4da74fca', 'PCashDoc_ReferenceNum' => 18,
                'PCashDoc_LegalNumber' => 'MJ1-202610-0003', 'PCashDoc_ApplyDate' => '2026-10-09T00:00:00', 'PCashDoc_CashAmt' => 3350000,
            ],
            $base + [
                'PCashDoc_SysRowID' => '46ad096e-cc20-41b1-9444-d674f19b4c82', 'PCashDoc_ReferenceNum' => 25,
                'PCashDoc_LegalNumber' => 'MJ1-202610-0011', 'PCashDoc_ApplyDate' => '2026-10-12T00:00:00', 'PCashDoc_CashAmt' => 400000,
            ],
        ];
    }
}