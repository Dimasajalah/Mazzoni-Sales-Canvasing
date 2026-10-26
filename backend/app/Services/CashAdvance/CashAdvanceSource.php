<?php
//backend/app/Services/CashAdvance/CashAdvanceSource.php
namespace App\Services\CashAdvance;

/** Sumber dokumen Cash Issue. Mengembalikan baris yang sudah dinormalkan oleh CashAdvanceRow. */
interface CashAdvanceSource
{
    /** @return array<int, array<string, mixed>> */
    public function fetch(): array;
}