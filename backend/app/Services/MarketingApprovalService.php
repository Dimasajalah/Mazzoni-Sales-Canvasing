<?php
namespace App\Services;

use App\Models\MarketingEvent;
use App\Models\MarketingEventApproval;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Approval berjenjang atas program marketing: Program Klaim (MKT05, 2 tahap) dan Event (MKT06, 5 tahap + tahap 6 bila RAB di atas 30 juta).
 * Approve maupun reject wajib reason code. Event yang ditolak direvisi lalu diajukan ulang (putaran naik, tahap kembali ke 1).
 */
class MarketingApprovalService
{
    public function __construct(
        private readonly MarketingEventService $events,
        private readonly AuditLogService $auditLogService,
    ) {
    }

    private function key(MarketingEvent $event): string
    {
        return $event->isClaimProgram() ? 'claim' : 'event';
    }

    /**
     * Tahap yang berlaku untuk program ini, berurutan dan berkunci nomor tahap. Tahap yang punya "when_amount_above"
     * hanya berlaku bila budget program di atas nilai itu.
     *
     * @return array<int, array{label: string, roles: array<int, string>, emails: array<int, string>}>
     */
    public function levels(MarketingEvent $event): array
    {
        $levels = [];
        foreach (config('marketing.approval.'.$this->key($event)) as $stage => $level) {
            $min = $level['when_amount_above'] ?? null;
            if ($min !== null && (float) $event->budget_amount <= (float) $min) {
                continue;
            }
            $levels[(int) $stage] = $level;
        }
        ksort($levels);

        return $levels;
    }

    public function levelLabel(MarketingEvent $event, int $stage): ?string
    {
        return $this->levels($event)[$stage]['label'] ?? null;
    }

    /** Tahap berikutnya setelah $stage; null bila $stage sudah tahap terakhir yang berlaku. */
    public function nextStage(MarketingEvent $event, int $stage): ?int
    {
        foreach (array_keys($this->levels($event)) as $candidate) {
            if ($candidate > $stage) {
                return $candidate;
            }
        }

        return null;
    }

    /** Boleh bertindak di tahap ini bila role-nya terdaftar atau email-nya terdaftar. */
    public function eligible(User $user, MarketingEvent $event, int $stage): bool
    {
        $level = $this->levels($event)[$stage] ?? null;
        if (! $level) {
            return false;
        }
        $emails = array_map('mb_strtolower', $level['emails'] ?? []);

        return in_array($user->role, $level['roles'] ?? [], true)
            || in_array(mb_strtolower((string) $user->email), $emails, true);
    }

    public function canAct(MarketingEvent $event, User $user): bool
    {
        return $event->status === 'PENDING_APPROVAL'
            && $this->eligible($user, $event, (int) $event->approval_stage);
    }

    /** Ringkasan untuk layar detail: putaran, tahap berjalan, daftar tahap yang berlaku, boleh bertindak atau tidak, dan pilihan reason code. */
    public function summary(MarketingEvent $event, User $user): array
    {
        $pending = $event->status === 'PENDING_APPROVAL';

        return [
            'stage' => (int) $event->approval_stage,
            'round' => (int) $event->approval_round,
            'levels' => collect($this->levels($event))->map(fn ($l, $stage) => ['stage' => (int) $stage, 'label' => $l['label']])->values()->all(),
            'awaiting_label' => $pending ? $this->levelLabel($event, (int) $event->approval_stage) : null,
            'can_act' => $this->canAct($event, $user),
            'reason_codes' => ['APPROVE' => $this->codes('APPROVE'), 'REJECT' => $this->codes('REJECT')],
        ];
    }

    /** @param 'APPROVE'|'REJECT' $type */
    public function act(MarketingEvent $event, User $user, string $type, string $reasonCode, ?string $notes = null): MarketingEvent
    {
        return DB::transaction(function () use ($event, $user, $type, $reasonCode, $notes) {
            $fresh = MarketingEvent::whereKey($event->id)->lockForUpdate()->firstOrFail();
            $noun = $fresh->isClaimProgram() ? 'Program klaim' : 'Event';

            if ($fresh->status !== 'PENDING_APPROVAL') {
                throw ValidationException::withMessages(['status' => $noun.' ini sudah diproses.']);
            }
            $stage = (int) $fresh->approval_stage;
            if (! $this->eligible($user, $fresh, $stage)) {
                throw new AuthorizationException('Anda bukan pemberi persetujuan Tahap '.$stage.' ('.$this->levelLabel($fresh, $stage).').');
            }

            MarketingEventApproval::create([
                'marketing_event_id' => $fresh->id,
                'stage' => $stage,
                'round' => (int) $fresh->approval_round,
                'stage_label' => $this->levelLabel($fresh, $stage),
                'action' => $type === 'APPROVE' ? 'APPROVED' : 'REJECTED',
                'reason_code' => $reasonCode,
                'notes' => $notes,
                'acted_by' => $user->id,
                'acted_at' => now(),
            ]);

            if ($type === 'REJECT') {
                $fresh->update(['status' => 'REJECTED']);
            } elseif (($next = $this->nextStage($fresh, $stage)) !== null) {
                $fresh->update(['approval_stage' => $next]);
            } else {
                $fresh->update(['status' => 'APPROVED']);
            }

            // Ditolak = budget dikembalikan ke Campaign.
            $this->events->recalcAllocated($fresh->budget);
            $prefix = $fresh->isClaimProgram() ? 'marketing_claim_program' : 'marketing_event';
            $this->auditLogService->log(
                $user->id,
                $prefix.($type === 'APPROVE' ? '.approve' : '.reject'),
                MarketingEvent::class,
                $fresh->id,
                ['status' => $event->status, 'approval_stage' => $stage],
                ['status' => $fresh->status, 'approval_stage' => $fresh->approval_stage, 'reason_code' => $reasonCode],
            );

            return $this->events->find($fresh->id);
        });
    }

    private function codes(string $type): array
    {
        return collect(config("marketing.approval_reason_codes.{$type}"))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all();
    }
}