<?php
//backend/app/Services/CashAdvance/PettyCashIssueWriter.php
namespace App\Services\CashAdvance;

interface PettyCashIssueWriter
{
    /**
     * @param  array{operation_type:string, display_name:string, cash_amount:float, customer_ref:?string, comment:string}  $payload
     * @return array{id:int|string, cash_document:string, legal_number:?string, creation_date:string}
     */
    public function create(string $salesId, array $payload): array;

    /** Dipanggil ulang khusus untuk retry upload foto yang gagal (E-09). */
    public function attach(int|string $issueId, array $storedPaths): void;
}