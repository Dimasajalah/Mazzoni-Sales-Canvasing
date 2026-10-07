<?php
// backend/app/Services/LeadTaskService.php

namespace App\Services;

use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadTask;
use App\Models\TaskTemplate;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Mesin tugas (FDD 4.3).
 *
 * Aturan (mengikuti prototype + FDD):
 *  - Saat lead dibuat, tugas pertama dari template Task Set otomatis terbentuk.
 *  - Konklusi tugas: NEXT (sales memilih tugas berikutnya), WIN, atau LOSE.
 *  - Tugas penutup (is_closing) hanya boleh WIN atau LOSE.
 *  - WIN  : status lead WIN, stage QUOTE, semua tugas terbuka ditutup.
 *  - LOSE : status lead LOSE, stage tetap di posisi terakhir, semua tugas terbuka ditutup.
 */
class LeadTaskService
{
    /**
     * Dashboard pipeline (hasil meeting Okt 2026, poin 6 & 9) — 8 status_customer, berurutan.
     * Menggantikan 7 langkah lama yang berbasis tugas aktif; sekarang langsung dari status_customer.
     */
    public const STATUS_CUSTOMER_STEPS = [
        Lead::STATUS_LEAD => ['label' => 'Lead', 'color' => 'var(--mut)'],
        Lead::STATUS_PROSPEK => ['label' => 'Prospek', 'color' => 'var(--orange2)'],
        Lead::STATUS_BRAND_AWARENESS => ['label' => 'Brand Awareness', 'color' => 'var(--blue)'],
        Lead::STATUS_SAMPLING => ['label' => 'Sampling', 'color' => '#7C5CFC'],
        Lead::STATUS_QUOTATION => ['label' => 'Quotation', 'color' => 'var(--amber)'],
        Lead::STATUS_WIN => ['label' => 'Win', 'color' => 'var(--green)'],
        Lead::STATUS_LOSE => ['label' => 'Lose', 'color' => 'var(--pink)'],
        Lead::STATUS_DISTRIBUTION => ['label' => 'Distribution', 'color' => '#0B7A46'],
    ];

    /**
     * Task Set B2B lama (7 langkah) masih dipakai sampai Tahap C merampingkan jadi 4 langkah;
     * mapping ini menjaga status_customer tetap sinkron selama masa transisi. Task pipeline_step
     * 'prospek'/'lead' sama-sama dipetakan ke Prospek karena lead yang daftar sendiri di mobile
     * selalu mulai dari Prospek (status_customer LEAD dicadangkan untuk data mentah HQ).
     */
    private const PIPELINE_STEP_TO_STATUS = [
        'prospek' => Lead::STATUS_PROSPEK,
        'lead' => Lead::STATUS_PROSPEK,
        'brand_awareness' => Lead::STATUS_BRAND_AWARENESS,
        'sampling' => Lead::STATUS_SAMPLING,
        'quote' => Lead::STATUS_QUOTATION,
    ];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function spawnFirstTask(Lead $lead, User $actor): ?LeadTask
    {
        if (! $lead->task_set_id) {
            return null;
        }

        $template = TaskTemplate::where('task_set_id', $lead->task_set_id)
            ->where('active', true)
            ->orderBy('seq')
            ->first();

        if (! $template) {
            return null;
        }

        return $this->createFromTemplate($lead, $template, $lead->salesperson_id ?? $actor->id, null);
    }

    public function createFromTemplate(Lead $lead, TaskTemplate $template, ?int $assignee, ?string $dueDate): LeadTask
    {
        return LeadTask::create([
            'lead_id' => $lead->id,
            'task_template_id' => $template->id,
            'seq' => $template->seq,
            'name' => $template->name,
            'task_type' => $template->task_type,
            'stage' => $template->stage,
            'pipeline_step' => $template->pipeline_step,
            'is_closing' => $template->is_closing,
            'mandatory' => $template->mandatory,
            'actions' => $template->actions ?? [],
            'assigned_to' => $assignee,
            'due_date' => $dueDate,
            'status' => LeadTask::OPEN,
            'pct_complete' => 0,
        ]);
    }

    /**
     * @param  array{next_template_id?: int|null, remark?: string|null, due_date?: string|null}  $data
     */
    public function conclude(LeadTask $task, string $conclusion, User $actor, array $data = []): LeadTask
    {
        $lead = $task->lead;

        if (! $task->isOpen()) {
            throw ValidationException::withMessages(['task' => ['Tugas ini sudah selesai.']]);
        }

        if ($lead->win_loss !== 'OPEN') {
            throw ValidationException::withMessages(['task' => ['Prospek ini sudah ditutup (Win/Lose).']]);
        }

        if ($conclusion === 'NEXT') {
            $finished = $this->concludeNext($task, $lead, $actor, $data);
            // Nomor penawaran terbit saat tugas pertama dikerjakan (idempotent)
            app(QuoteService::class)->ensureDraftForLead($lead->fresh(), $actor);

            return $finished;
        }

        return DB::transaction(function () use ($task, $lead, $conclusion, $actor, $data) {
            $this->finishTask($task, $conclusion, $data['remark'] ?? null, $data['reason_code'] ?? null);
            if ($conclusion === 'WIN') {
                app(QuoteService::class)->ensureDraftForLead($lead, $actor);
            }
            $this->closeLead($lead, $conclusion === 'WIN' ? 'WIN' : 'LOSE', $actor, $data['remark'] ?? null);

            return $task->fresh(['lead']);
        });
    }

    /**
     * Poin 12: dipakai oleh form Brand/Sample/Feedback — keputusan di form itu SENDIRI yang
     * menyelesaikan tugasnya (Conclusion + Reason Code), tanpa langkah "Selesaikan Tugas" terpisah.
     * LOSE menutup lead penuh (sama seperti conclude() manual). NEXT mencari tugas berikutnya lewat
     * pipeline_step (bukan seq), supaya "Revision" bisa mengulang tahap Sample yang sama (loop).
     */
    public function concludeFromAction(LeadTask $task, string $conclusion, string $reasonCode, User $actor, ?string $nextPipelineStep = null): void
    {
        $lead = $task->lead;

        if (! $task->isOpen() || $lead->win_loss !== 'OPEN') {
            return; // sudah diselesaikan/ditutup sebelumnya -> diamkan (idempotent)
        }

        DB::transaction(function () use ($task, $lead, $conclusion, $reasonCode, $actor, $nextPipelineStep) {
            if ($conclusion === 'LOSE') {
                $this->finishTask($task, 'LOSE', null, $reasonCode);
                $this->closeLead($lead, 'LOSE', $actor, null);

                return;
            }

            $this->finishTask($task, 'NEXT', null, $reasonCode);

            $template = TaskTemplate::where('task_set_id', $lead->task_set_id)
                ->where('pipeline_step', $nextPipelineStep)
                ->where('active', true)
                ->first();

            if (! $template) {
                return;
            }

            $this->createFromTemplate($lead, $template, $task->assigned_to ?? $lead->salesperson_id ?? $actor->id, null);

            $newStatus = self::PIPELINE_STEP_TO_STATUS[$template->pipeline_step] ?? null;
            if ($newStatus !== null && $newStatus !== $lead->status_customer) {
                $fromStage = $lead->stage;
                $lead->update(['status_customer' => $newStatus]);
                LeadActivity::create([
                    'lead_id' => $lead->id,
                    'user_id' => $actor->id,
                    'activity_type' => 'STAGE_CHANGE',
                    'from_stage' => $fromStage,
                    'to_stage' => $lead->fresh()->stage,
                    'notes' => 'Lanjut ke tugas: '.$template->name,
                    ]);
                    }
                });
        
                // Nomor penawaran terbit saat tugas pertama dikerjakan (idempotent) — sama seperti
                // conclude() manual. Sebelum perbaikan ini, lead yang maju lewat form Brand/Sample (poin
                // 12) tidak pernah dapat Quote otomatis, jadi tombol "Penawaran" selalu mengira belum ada
                // penawaran sama sekali dan membuka form kosong baru, bukan penawaran lead itu.
                if ($conclusion === 'NEXT') {
                    app(QuoteService::class)->ensureDraftForLead($lead->fresh(), $actor);
                }
            }
        
            /** Dipakai saat order dibuat dari lead: prospek otomatis WIN. */
    public function markWon(Lead $lead, User $actor, string $note = 'Order dibuat dari prospek'): void
    {
        if ($lead->win_loss === 'WIN') {
            return;
        }

        DB::transaction(function () use ($lead, $actor, $note) {
            $this->closeLead($lead, 'WIN', $actor, $note);
        });
    }

    public function updateTask(LeadTask $task, array $data): LeadTask
    {
        $task->update(array_intersect_key($data, array_flip(['due_date', 'remark'])));

        return $task->fresh();
    }

    /** @return array{unscheduled:int, late:int, scheduled:int, total:int} */
    public function summary(User $user): array
    {
        $today = now()->toDateString();
        $open = $this->visibleTasks($user)->where('status', LeadTask::OPEN);

        $unscheduled = (clone $open)->whereNull('due_date')->count();
        $late = (clone $open)->whereNotNull('due_date')->where('due_date', '<', $today)->count();
        $scheduled = (clone $open)->whereNotNull('due_date')->where('due_date', '>=', $today)->count();

        return [
            'unscheduled' => $unscheduled,
            'late' => $late,
            'scheduled' => $scheduled,
            'total' => $unscheduled + $late + $scheduled,
        ];
    }

    /** Query tugas yang boleh dilihat user (sales hanya miliknya). */
    public function visibleTasks(User $user)
    {
        return LeadTask::query()->when(
            $user->role === 'sales',
            fn ($q) => $q->where(function ($w) use ($user) {
                $w->where('assigned_to', $user->id)
                    ->orWhereHas('lead', fn ($l) => $l->where('salesperson_id', $user->id));
            })
        );
    }

    public function canAccessLead(User $user, Lead $lead): bool
    {
        return $user->role !== 'sales' || $lead->salesperson_id === $user->id;
    }

    /**
     * Dashboard pipeline 8 status_customer (poin 6 & 9, hasil meeting Okt 2026).
     *
     * @return list<array{key:string,label:string,color:string,count:int}>
     */
    public function pipelineCounts(User $user): array
    {
        $counts = Lead::query()
            ->when($user->role === 'sales', fn ($q) => $q->where('salesperson_id', $user->id))
            ->selectRaw('status_customer, count(*) as total')
            ->groupBy('status_customer')
            ->pluck('total', 'status_customer');

        $out = [];
        foreach (self::STATUS_CUSTOMER_STEPS as $key => $meta) {
            $out[] = ['key' => $key, 'label' => $meta['label'], 'color' => $meta['color'], 'count' => (int) ($counts[$key] ?? 0)];
        }

        return $out;
    }

    private function concludeNext(LeadTask $task, Lead $lead, User $actor, array $data): LeadTask
    {
        if ($task->is_closing) {
            throw ValidationException::withMessages([
                'conclusion' => ['Tugas penutup hanya bisa diselesaikan dengan Win atau Lose.'],
            ]);
        }

        $template = ! empty($data['next_template_id'])
            ? TaskTemplate::where('id', $data['next_template_id'])->where('active', true)->first()
            : null;

        if (! $template || $template->task_set_id !== $lead->task_set_id) {
            throw ValidationException::withMessages([
                'next_template_id' => ['Pilih tugas berikutnya dari Task Set prospek ini.'],
            ]);
        }

        if ($template->seq === $task->seq) {
            throw ValidationException::withMessages([
                'next_template_id' => ['Tugas berikutnya tidak boleh sama dengan tugas saat ini.'],
            ]);
        }

        DB::transaction(function () use ($task, $lead, $template, $actor, $data) {
            $this->finishTask($task, 'NEXT', $data['remark'] ?? null, $data['reason_code'] ?? null);

            $next = $this->createFromTemplate(
                $lead,
                $template,
                $task->assigned_to ?? $lead->salesperson_id ?? $actor->id,
                $data['due_date'] ?? null
            );

            $newStatus = self::PIPELINE_STEP_TO_STATUS[$template->pipeline_step] ?? null;
            if ($newStatus !== null && $newStatus !== $lead->status_customer) {
                $fromStage = $lead->stage;
                $lead->update(['status_customer' => $newStatus]); // stage lama ikut turun otomatis
                LeadActivity::create([
                    'lead_id' => $lead->id,
                    'user_id' => $actor->id,
                    'activity_type' => 'STAGE_CHANGE',
                    'from_stage' => $fromStage,
                    'to_stage' => $lead->fresh()->stage,
                    'notes' => 'Lanjut ke tugas: '.$template->name,
                ]);
            }

            $this->auditLogService->log($actor->id, 'lead.task.next', LeadTask::class, $task->id, null, $next->toArray());
        });

        return $task->fresh();
    }

    private function finishTask(LeadTask $task, string $conclusion, ?string $remark, ?string $reasonCode = null): void
    {
        $task->update([
            'status' => LeadTask::DONE,
            'conclusion' => $conclusion,
            'reason_code' => $reasonCode,
            'pct_complete' => 100,
            'completed_at' => now(),
            'remark' => $remark ?: $task->remark,
        ]);
    }

    private function closeLead(Lead $lead, string $result, User $actor, ?string $note): void
    {
        LeadTask::where('lead_id', $lead->id)
            ->where('status', LeadTask::OPEN)
            ->update([
                'status' => LeadTask::DONE,
                'conclusion' => $result,
                'pct_complete' => 100,
                'completed_at' => now(),
            ]);

        $fromStage = $lead->stage;

        $lead->update(['status_customer' => $result === 'WIN' ? Lead::STATUS_WIN : Lead::STATUS_LOSE]);

        // Penawaran yang masih berjalan ikut ditutup (Won / Lost)
        app(QuoteService::class)->syncFromLead($lead, $result);

        LeadActivity::create([
            'lead_id' => $lead->id,
            'user_id' => $actor->id,
            'activity_type' => $result,
            'from_stage' => $fromStage,
            'to_stage' => $lead->fresh()->stage,
            'notes' => $note,
        ]);

        $this->auditLogService->log($actor->id, 'lead.'.strtolower($result), Lead::class, $lead->id, null, $lead->fresh()->toArray());
    }
}