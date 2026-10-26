<?php
//backend/app/Services/CashAdvance/EpicorPettyCashIssueWriter.php
namespace App\Services\CashAdvance;

/** TODO: isi setelah metode tulis Epicor (BAQ/BO/EFx untuk Cash Document) dikonfirmasi. */
class EpicorPettyCashIssueWriter implements PettyCashIssueWriter
{
    public function create(string $salesId, array $payload): array
    {
        throw new \RuntimeException('EpicorPettyCashIssueWriter belum diimplementasikan.');
    }

    public function attach(int|string $issueId, array $storedPaths): void
    {
        throw new \RuntimeException('EpicorPettyCashIssueWriter belum diimplementasikan.');
    }
}