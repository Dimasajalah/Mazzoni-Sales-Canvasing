<?php
//backend/app/Services/CashAdvance/StagingPettyCashIssueWriter.php
namespace App\Services\CashAdvance;

use App\Models\CashAdvanceStagingIssue;

class StagingPettyCashIssueWriter implements PettyCashIssueWriter
{
    public function __construct(private readonly int $userId)
    {
    }

    public function create(string $salesId, array $payload): array
    {
        $today = now()->toDateString();

        // E-10: ketukan ganda / retry setelah koneksi putus — anggap sudah tersimpan bila kembar persis.
        $existing = CashAdvanceStagingIssue::where('user_id', $this->userId)
            ->where('operation_type', $payload['operation_type'])
            ->where('cash_amount', $payload['cash_amount'])
            ->where('creation_date', $today)
            ->first();

        $issue = $existing ?: CashAdvanceStagingIssue::create([
            'user_id' => $this->userId,
            'operation_type' => $payload['operation_type'],
            'display_name' => $payload['display_name'],
            'cash_amount' => $payload['cash_amount'],
            'customer_ref' => $payload['customer_ref'] ?? null,
            'comment' => $payload['comment'],
            'creation_date' => $today,
        ]);

        return [
            'id' => $issue->id,
            'cash_document' => $issue->cashDocumentNumber(),
            'legal_number' => null,
            'creation_date' => $issue->creation_date->toDateString(),
        ];
    }

    public function attach(int|string $issueId, array $storedPaths): void
    {
        $issue = CashAdvanceStagingIssue::findOrFail($issueId);
        $current = $issue->attachments ?? [];

        if (count($current) + count($storedPaths) > 3) { // E-11
            throw new \RuntimeException('Maksimal 3 foto bukti.');
        }

        $issue->update(['attachments' => array_merge($current, $storedPaths)]);
    }
}