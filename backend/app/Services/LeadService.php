<?php
// backend/app/Services/LeadService.php

namespace App\Services;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadFollowup;
use App\Models\LeadTask;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LeadService
{
    public function __construct(
        private readonly AuditLogService $auditLogService,
        private readonly LeadTaskService $leadTaskService,
    ) {}

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Lead::query()->with(['salesperson', 'currentTask.assignee:id,name']);

        if (! empty($filters['stage'])) {
            $query->where('stage', $filters['stage']);
        }

        if (! empty($filters['win_loss'])) {
            $query->where('win_loss', $filters['win_loss']);
        }

        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        if (! empty($filters['q'])) {
            $q = $filters['q'];
            $query->where(function ($builder) use ($q) {
                $builder->where('business_name', 'like', "%{$q}%")
                    ->orWhere('owner_name', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%");
            });
        }

        return $query->latest()->paginate($perPage);
    }

    public function find(int $id): ?Lead
    {
        return Lead::with(['salesperson', 'activities', 'tasks', 'currentTask.assignee:id,name', 'journeyEntries'])->find($id);
    }

    public function create(array $data, User $user): Lead
    {
        if (! empty($data['client_uuid'])) {
            $existing = Lead::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return $existing->load(['salesperson', 'activities', 'tasks', 'currentTask.assignee:id,name']);
            }
        }

        $lead = Lead::create([
            ...$data,
            'salesperson_id' => $data['salesperson_id'] ?? $user->id,
            'status_customer' => $data['status_customer'] ?? Lead::STATUS_PROSPEK,
            'register_date' => $data['register_date'] ?? now()->toDateString(),
            'territory' => $data['territory'] ?? $user->territory,
            'client_uuid' => $data['client_uuid'] ?? (string) Str::uuid(),
        ]);

        LeadActivity::create([
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'activity_type' => 'CREATED',
            'notes' => 'Lead registered',
            'to_stage' => $lead->stage,
        ]);

        // Task Set otomatis ter-generate saat lead dibuat (FDD 4.1 / 4.3)
        $this->leadTaskService->spawnFirstTask($lead, $user);

        $this->auditLogService->log($user->id, 'lead.create', Lead::class, $lead->id, null, $lead->toArray());

        return $lead->load(['salesperson', 'activities', 'tasks', 'currentTask.assignee:id,name']);
    }

    public function update(Lead $lead, array $data, User $user): Lead
    {
        $oldStage = $lead->stage;
        $oldWinLoss = $lead->win_loss;
        $old = $lead->toArray();
        $lead->update($data);

        if (isset($data['stage']) && $data['stage'] !== $oldStage) {
            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $user->id,
                'activity_type' => 'STAGE_CHANGE',
                'from_stage' => $oldStage,
                'to_stage' => $lead->stage,
                'notes' => $data['notes'] ?? null,
            ]);
        }

        if (isset($data['win_loss']) && $data['win_loss'] !== $oldWinLoss) {
            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $user->id,
                'activity_type' => 'STATUS_CHANGE',
                'from_stage' => $oldWinLoss,
                'to_stage' => $lead->win_loss,
                'notes' => $data['notes'] ?? null,
            ]);
        }

        $this->auditLogService->log($user->id, 'lead.update', Lead::class, $lead->id, $old, $lead->fresh()->toArray());

        return $lead->fresh(['salesperson', 'activities', 'tasks', 'currentTask.assignee:id,name']);
    }

    /** Simpan foto toko (poin 1). Foto lama, bila ada, dihapus. */
    public function storePhoto(Lead $lead, UploadedFile $file, User $user): Lead
    {
        $old = $lead->store_photo_path;
        $path = $file->store('leads/' . $lead->id, 'public');

        $lead->update(['store_photo_path' => $path]);

        if ($old && $old !== $path) {
            Storage::disk('public')->delete($old);
        }

        $this->auditLogService->log($user->id, 'lead.photo', Lead::class, $lead->id, null, ['store_photo_path' => $path]);

        return $lead->fresh(['salesperson', 'currentTask.assignee:id,name']);
    }

    public function delete(Lead $lead, User $user): void
    {
        $this->auditLogService->log($user->id, 'lead.delete', Lead::class, $lead->id, $lead->toArray());
        $lead->delete();
    }

    /** Legacy: follow-up bebas (sebelum mesin tugas). Endpoint dipertahankan agar tidak memutus klien lama. */
    public function scheduleFollowup(Lead $lead, array $data, User $user): LeadFollowup
    {
        return LeadFollowup::create([
            'lead_id' => $lead->id,
            'salesperson_id' => $data['salesperson_id'] ?? $user->id,
            'task_set_id' => $data['task_set_id'] ?? null,
            'task_type_id' => $data['task_type_id'] ?? null,
            'task_id' => $data['task_id'] ?? null,
            'followup_at' => $data['followup_at'],
            'notes' => $data['notes'] ?? null,
            'status' => 'PENDING',
        ]);
    }

    public function resolveBrandAwareness(Lead $lead, string $decision, User $user, ?int $leadTaskId = null, bool $manualConclude = false): Lead
    {
        // Poin 12 (direvisi tim functional, Okt 2026): "Conclusion & Reason Code dipilih MANUAL
        // oleh sales" — jadi form ini sekarang HANYA mencatat keputusan (data/histori), tidak lagi
        // otomatis menyimpulkan & menyelesaikan tugas. Penyelesaian tugas kini dilakukan lewat
        // panggilan concludeLeadTask() terpisah (field Conclusion/Reason Code/Tugas berikutnya di
        // form yang sama). $manualConclude=true sengaja melewati SEMUA penyelesaian tugas otomatis
        // di sini. Parameter lama (auto-conclude) dipertahankan untuk kompatibilitas klien lama.
        $task = $leadTaskId ? LeadTask::find($leadTaskId) : null;

        if ($decision === 'NOT_INTERESTED') {
            if ($manualConclude) {
                // tidak menyentuh tugas/status sama sekali -> sales yang akan conclude manual
            } elseif ($task) {
                $this->leadTaskService->concludeFromAction($task, 'LOSE', 'Tidak Tertarik', $user);
            } else {
                $lead->update(['status_customer' => Lead::STATUS_LOSE]);
            }

            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $user->id,
                'activity_type' => 'BRAND_AWARENESS',
                'notes' => 'Tidak tertarik pada tahap Brand Awareness',
            ]);

            return $lead->fresh(['salesperson', 'customer', 'currentTask.assignee:id,name']);
        }

        $this->ensureCustomer($lead);

        if ($manualConclude) {
            // tidak menyentuh tugas/status -> sales yang akan conclude manual (Customer tetap dibuat di atas)
        } elseif ($task) {
            $this->leadTaskService->concludeFromAction($task, 'NEXT', 'Tertarik', $user, 'sampling');
        } else {
            $lead->update(['status_customer' => Lead::STATUS_SAMPLING]);
        }

        LeadActivity::create([
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'activity_type' => 'BRAND_AWARENESS',
            'notes' => 'Tertarik pada tahap Brand Awareness — Customer ' . $lead->customer->customer_code . ' dibuat',
        ]);

        return $lead->fresh(['salesperson', 'customer', 'currentTask.assignee:id,name']);
    }

    /**
     * Feedback Sample dicatat (poin 10, 11 & 12): Interest -> lanjut ke Quotation (sample cocok).
     * Not Interest -> Lose (tugas + lead ditutup penuh). Revision -> tetap di Sampling, tugas
     * Sample diulang (loop) untuk sesi sampling berikutnya. Kalau form ini terkait sebuah tugas,
     * keputusan di sini langsung menyelesaikan tugas itu dengan Conclusion + Reason Code sendiri.
     */
    public function resolveSampleFeedback(Lead $lead, ?string $feedbackType, User $user, ?int $leadTaskId = null, bool $manualConclude = false): Lead
    {
        $task = $leadTaskId ? LeadTask::find($leadTaskId) : null;

        $plan = match ($feedbackType) {
            'interest' => ['conclusion' => 'NEXT', 'reason' => 'Sample Cocok', 'next_step' => 'quote', 'status' => Lead::STATUS_QUOTATION],
            'not_interest' => ['conclusion' => 'LOSE', 'reason' => 'Sample Ditolak', 'next_step' => null, 'status' => Lead::STATUS_LOSE],
            default => ['conclusion' => 'NEXT', 'reason' => 'Sample Direvisi', 'next_step' => 'sampling', 'status' => null], // revision: ulang tahap Sample
        };

        // Revisi tim functional: Conclusion & Reason Code dipilih MANUAL oleh sales -> lewati
        // penyelesaian tugas otomatis di sini bila $manualConclude.
        if ($manualConclude) {
            // tidak menyentuh tugas/status sama sekali
        } elseif ($task) {
            $this->leadTaskService->concludeFromAction($task, $plan['conclusion'], $plan['reason'], $user, $plan['next_step']);
        } elseif ($plan['status'] !== null) {
            $lead->update(['status_customer' => $plan['status']]);
        }

        LeadActivity::create([
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'activity_type' => 'SAMPLE_FEEDBACK',
            'notes' => 'Feedback sample: ' . $feedbackType,
        ]);

        return $lead->fresh(['salesperson', 'customer', 'currentTask.assignee:id,name']);
    }

    /**
     * Bentuk Customer dari data lead. Idempotent: kalau lead sudah punya customer, tidak membuat
     * yang baru. Dipakai Form Brand (Tertarik) dan penyelesaian tugas Brand Awareness (Lanjut).
     */
    public function ensureCustomer(Lead $lead): Customer
    {
        if ($lead->customer_id) {
            return $lead->customer;
        }

        $customer = Customer::create([
            'customer_code' => $this->nextCustomerCode(),
            'name' => $lead->business_name,
            'address' => $lead->address,
            'phone' => $lead->phone,
            'email' => $lead->email,
            'npwp' => $lead->npwp,
            'latitude' => $lead->latitude,
            'longitude' => $lead->longitude,
            'salesperson_id' => $lead->salesperson_id,
            'active' => true,
            // Kode di atas sementara (belum dari Epicor); menunggu jawaban tim functional
            // soal siapa yang menerbitkan nomor resmi CustomerSvc saat integrasi Epicor berjalan.
            'sync_status' => 'PENDING',
        ]);

        $lead->update(['customer_id' => $customer->id]);

        return $customer;
    }

    private function nextCustomerCode(): string
    {
        $prefix = 'CUST-STG-' . now()->format('Y') . '-';
        $last = Customer::where('customer_code', 'like', $prefix . '%')->orderByDesc('customer_code')->value('customer_code');
        $seq = $last ? ((int) substr($last, -6)) + 1 : 1;

        return $prefix . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
    }
}
