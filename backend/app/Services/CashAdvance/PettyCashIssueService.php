<?php
//backend/app/Services/CashAdvance/PettyCashIssueService.php
namespace App\Services\CashAdvance;

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class PettyCashIssueService
{
    public function __construct(private readonly PettyCashDashboardService $dashboard)
    {
    }

    /**
     * @param  UploadedFile[]  $photos
     * @return array{id:int|string, cash_document:string, legal_number:?string, creation_date:string, attachment_failures:string[]}
     */
    public function save(User $user, array $payload, array $photos): array
    {
        $balance = $this->dashboard->summary($user, now()->format('Y-m'))['balance'];
        if ((float) $payload['cash_amount'] > $balance) {
            throw new \InvalidArgumentException('Nominal melebihi saldo Cash Advance.'); // E-05
        }

        $result = $this->writer($user->id)->create($this->salesId($user), $payload);
        $result['attachment_failures'] = $this->storeAttachments($result['id'], $photos);

        return $result;
    }

    /** @return string[] nama file yang gagal diunggah (E-09) */
    public function retryAttachments(User $user, int|string $issueId, array $photos): array
    {
        return $this->storeAttachments($issueId, $photos);
    }

    private function storeAttachments(int|string $issueId, array $photos): array
    {
        $stored = [];
        $failed = [];

        foreach ($photos as $photo) {
            try {
                $path = $photo->store("cash-advance/{$issueId}", 'public');
                $stored[] = ['path' => $path, 'original_name' => $photo->getClientOriginalName()];
            } catch (\Throwable) {
                $failed[] = $photo->getClientOriginalName();
            }
        }

        if ($stored) {
            $this->writer()->attach($issueId, $stored);
        }

        return $failed;
    }

    private function salesId(User $user): string
    {
        return (string) ($user->username ?: $user->email);
    }

    private function writer(?int $userId = null): PettyCashIssueWriter
    {
        return config('cash_advance.source') === 'epicor'
            ? new EpicorPettyCashIssueWriter()
            : new StagingPettyCashIssueWriter($userId ?? request()->user()->id);
    }
}