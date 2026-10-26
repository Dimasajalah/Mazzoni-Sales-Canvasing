<?php
namespace App\Services;

use App\Models\MarketingClaim;
use App\Models\MarketingClaimApproval;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.9 (MKT09 Approval Pengajuan Program Klaim):
 * 01 Koordinator Marketing mengonfirmasi nilai selisih ke distributor (di luar sistem, di sini dicatat),
 * 02-05 approval tahap 1-4 (Koordinator Marketing, Manager Marketing, Manager Accounting, Direktur Sales),
 * 06 Direktur Sales boleh menyesuaikan nilai dengan alasan, 07 Marketing menetapkan Nilai Klaim Disetujui.
 */
class MarketingClaimApprovalService
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /** @return array<int, array{label: string, roles: array<int, string>, emails: array<int, string>}> */
    public function levels(): array
    {
        return config('marketing.approval.claim_submission');
    }

    public function lastStage(): int
    {
        return max(array_keys($this->levels()));
    }

    public function levelLabel(int $stage): ?string
    {
        return $this->levels()[$stage]['label'] ?? null;
    }

    public function eligible(User $user, int $stage): bool
    {
        $level = $this->levels()[$stage] ?? null;
        if (! $level) {
            return false;
        }
        $emails = array_map('mb_strtolower', $level['emails'] ?? []);

        return in_array($user->role, $level['roles'] ?? [], true) || in_array(mb_strtolower((string) $user->email), $emails, true);
    }

    /** Konfirmasi selisih ke distributor dilakukan pemberi persetujuan tahap 1 (Koordinator Marketing). */
    public function canConfirm(MarketingClaim $claim, User $user): bool
    {
        return $claim->status === 'SUBMITTED' && $this->eligible($user, 1);
    }

    public function canAct(MarketingClaim $claim, User $user): bool
    {
        return $claim->status === 'IN_APPROVAL' && $this->eligible($user, (int) $claim->approval_stage);
    }

    /** Nilai yang harus menjadi Nilai Klaim Disetujui: hasil penyesuaian Direktur Sales bila ada, selain itu nilai eligible. */
    public function expectedAmount(MarketingClaim $claim): ?float
    {
        if ($claim->adjusted_amount !== null) {
            return (float) $claim->adjusted_amount;
        }

        return $claim->eligible_amount !== null ? (float) $claim->eligible_amount : null;
    }

    public function awaitingLabel(MarketingClaim $claim): ?string
    {
        return match ($claim->status) {
            'SUBMITTED' => $this->levelLabel(1).' (konfirmasi selisih ke distributor)',
            'IN_APPROVAL' => $this->levelLabel((int) $claim->approval_stage),
            'AWAITING_AMOUNT' => 'Marketing (input Nilai Klaim Disetujui)',
            default => null,
        };
    }

    public function summary(MarketingClaim $claim, User $user): array
    {
        $canAct = $this->canAct($claim, $user);

        return [
            'stage' => (int) $claim->approval_stage,
            'round' => 1,
            'levels' => collect($this->levels())->map(fn ($l, $stage) => ['stage' => (int) $stage, 'label' => $l['label']])->values()->all(),
            'awaiting_label' => $this->awaitingLabel($claim),
            'can_confirm' => $this->canConfirm($claim, $user),
            'can_act' => $canAct,
            'can_adjust' => $canAct && (int) $claim->approval_stage === $this->lastStage(),
            'can_finalize' => $claim->status === 'AWAITING_AMOUNT',
            'expected_amount' => $this->expectedAmount($claim),
            'reason_codes' => ['APPROVE' => $this->codes('APPROVE'), 'REJECT' => $this->codes('REJECT')],
        ];
    }

    /** Klaim yang sedang menunggu tindakan pengguna ini (konfirmasi selisih atau approval), untuk Program Approval Dashboard. */
    public function pendingFor(User $user): Collection
    {
        return MarketingClaim::query()->with(['customer:id,customer_code,name,city', 'program.budget:id,campaign_code,name'])
            ->whereIn('status', ['SUBMITTED', 'IN_APPROVAL'])->orderBy('id')->get()
            ->filter(fn (MarketingClaim $c) => $this->canConfirm($c, $user) || $this->canAct($c, $user))->values();
    }

    // ------------------------------------------------------------- tindakan

    /** Langkah 01: distributor menyetujui nilai selisih (dikonfirmasi di luar sistem), approval tahap 1 dimulai. */
    public function confirmDifference(MarketingClaim $claim, User $user, ?string $notes = null): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $user, $notes) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            if ($fresh->status !== 'SUBMITTED') {
                throw ValidationException::withMessages(['status' => 'Klaim ini tidak sedang menunggu konfirmasi selisih.']);
            }
            if (! $this->eligible($user, 1)) {
                throw new AuthorizationException('Konfirmasi selisih dilakukan oleh '.$this->levelLabel(1).'.');
            }

            $fresh->update(['status' => 'IN_APPROVAL', 'approval_stage' => 1, 'diff_confirmed_at' => now(), 'diff_confirmed_by' => $user->id, 'diff_confirm_notes' => $notes]);
            $this->auditLogService->log($user->id, 'marketing_claim.confirm_difference', MarketingClaim::class, $fresh->id, ['status' => 'SUBMITTED'], ['status' => 'IN_APPROVAL']);

            return $this->claims()->find($fresh->id);
        });
    }

    /**
     * Langkah 02-06. Menyetujui memindahkan klaim ke tahap berikutnya; setelah tahap terakhir klaim menunggu Nilai Klaim Disetujui.
     * Menolak menghentikan klaim. Direktur Sales (tahap terakhir) boleh menyesuaikan nilai dengan alasan.
     *
     * @param 'APPROVE'|'REJECT' $type
     */
    public function act(MarketingClaim $claim, User $user, string $type, string $reasonCode, ?string $notes = null, ?float $adjustedAmount = null, ?string $adjustReason = null): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $user, $type, $reasonCode, $notes, $adjustedAmount, $adjustReason) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            if ($fresh->status !== 'IN_APPROVAL') {
                throw ValidationException::withMessages(['status' => 'Klaim ini tidak sedang dalam proses approval.']);
            }
            $stage = (int) $fresh->approval_stage;
            if (! $this->eligible($user, $stage)) {
                throw new AuthorizationException('Anda bukan pemberi persetujuan Tahap '.$stage.' ('.$this->levelLabel($stage).').');
            }

            $adjusting = $type === 'APPROVE' && $adjustedAmount !== null;
            if ($adjusting) {
                if ($stage !== $this->lastStage()) {
                    throw ValidationException::withMessages(['adjusted_amount' => 'Penyesuaian nilai hanya dilakukan oleh '.$this->levelLabel($this->lastStage()).'.']);
                }
                if ($adjustedAmount <= 0 || $adjustedAmount > (float) $fresh->claimed_amount) {
                    throw ValidationException::withMessages(['adjusted_amount' => 'Nilai penyesuaian harus lebih dari 0 dan tidak lebih besar dari nilai pengajuan.']);
                }
                if (blank($adjustReason)) {
                    throw ValidationException::withMessages(['adjust_reason' => 'Alasan penyesuaian nilai wajib diisi.']);
                }
            }

            MarketingClaimApproval::create([
                'marketing_claim_id' => $fresh->id, 'stage' => $stage, 'stage_label' => $this->levelLabel($stage),
                'action' => $type === 'APPROVE' ? 'APPROVED' : 'REJECTED', 'reason_code' => $reasonCode, 'notes' => $notes,
                'adjusted_amount' => $adjusting ? $adjustedAmount : null, 'adjust_reason' => $adjusting ? $adjustReason : null,
                'acted_by' => $user->id, 'acted_at' => now(),
            ]);

            if ($type === 'REJECT') {
                $fresh->update(['status' => 'REJECTED']);
            } elseif ($stage < $this->lastStage()) {
                $fresh->update(['approval_stage' => $stage + 1]);
            } else {
                $fresh->update(['status' => 'AWAITING_AMOUNT'] + ($adjusting ? [
                    'adjusted_amount' => $adjustedAmount, 'adjust_reason' => $adjustReason, 'adjusted_by' => $user->id, 'adjusted_at' => now(),
                ] : []));
            }

            $this->auditLogService->log($user->id, $type === 'APPROVE' ? 'marketing_claim.approve' : 'marketing_claim.reject', MarketingClaim::class, $fresh->id,
                ['status' => 'IN_APPROVAL', 'approval_stage' => $stage],
                ['status' => $fresh->status, 'approval_stage' => $fresh->approval_stage, 'reason_code' => $reasonCode, 'adjusted_amount' => $adjusting ? $adjustedAmount : null]);

            return $this->claims()->find($fresh->id);
        });
    }

    /** Langkah 07: Marketing menetapkan Nilai Klaim Disetujui sebagai nilai final; harus sama dengan hasil approval. */
    public function finalizeAmount(MarketingClaim $claim, User $user, float $amount): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $user, $amount) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            if ($fresh->status !== 'AWAITING_AMOUNT') {
                throw ValidationException::withMessages(['status' => 'Nilai Klaim Disetujui hanya diisi setelah semua tahap approval selesai.']);
            }

            $expected = $this->expectedAmount($fresh);
            if ($expected === null || abs($amount - $expected) > 0.005) {
                throw ValidationException::withMessages(['amount' => 'Nilai Klaim Disetujui harus sama dengan nilai hasil approval (Rp '.number_format((float) $expected, 0, ',', '.').').']);
            }

            $fresh->update(['approved_amount' => $amount, 'status' => 'APPROVED', 'final_confirmed_by' => $user->id, 'final_confirmed_at' => now()]);
            $this->auditLogService->log($user->id, 'marketing_claim.final_amount', MarketingClaim::class, $fresh->id, ['status' => 'AWAITING_AMOUNT'], ['status' => 'APPROVED', 'approved_amount' => $amount]);

            return $this->claims()->find($fresh->id);
        });
    }

    private function claims(): MarketingClaimService
    {
        return app(MarketingClaimService::class);
    }

    private function codes(string $type): array
    {
        return collect(config("marketing.approval_reason_codes.{$type}"))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all();
    }
}