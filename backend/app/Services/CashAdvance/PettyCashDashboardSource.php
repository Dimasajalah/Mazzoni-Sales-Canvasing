<?php
//backend/app/Services/CashAdvance/PettyCashDashboardSource.php
namespace App\Services\CashAdvance;

/** Sumber data Dashboard Cash Advance: Saldo, kategori, dan daftar dokumen per bulan (FDD Cash Advance 2.4). */
interface PettyCashDashboardSource
{
    /** @return array{cash_desk:?string, balance:float, total_issue:float, total_receipt:float}|null null bila Sales ID tidak terdaftar di UD02_BMT_SalesCashDesk (E-01). */
    public function summary(string $salesId, string $month): ?array;

    /** @return array<int, array{operation_type:string, display_name:string, icon:?string, sort_order:int, doc_count:int, total:float}> */
    public function categories(string $salesId, string $month): array;

    /**
     * @param  'issue'|'receipt'  $direction
     * @return array<int, array{creation_date:string, cash_document:string, legal_number:?string, amount:float}>
     */
    public function documents(string $salesId, string $month, string $direction, ?string $operationType = null): array;
}