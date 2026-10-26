<?php
namespace App\Services;

use App\Models\Customer;
use App\Models\MarketingBudget;
use App\Models\MarketingEvent;
use App\Models\MarketingEventAttachment;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Blueprint MJU 3.2.2 (MKT02 Pure Event Entry) dan 3.2.4 (MKT04 Program Klaim Entry). Approval dikerjakan di tahap berikutnya. */
class MarketingEventService
{
    private const CLAIM_FIELDS = ['claim_type', 'claim_source', 'claim_basis', 'claim_threshold', 'claim_rate', 'claim_rate_type', 'claim_deadline'];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /** kind: EVENT = semua kecuali Program Klaim, KLAIM = hanya Program Klaim, kosong = semuanya. */
    public function list(array $filters = []): Collection
    {
        $kind = $filters['kind'] ?? null;

        return MarketingEvent::query()
            ->with('budget:id,campaign_code,name')
            ->withCount('participants')
            ->when(! empty($filters['marketing_budget_id']), fn ($q) => $q->where('marketing_budget_id', (int) $filters['marketing_budget_id']))
            ->when(! empty($filters['status']), fn ($q) => $q->where('status', $filters['status']))
            ->when($kind === 'EVENT', fn ($q) => $q->where('activity_type', '!=', MarketingEvent::CLAIM_TYPE))
            ->when($kind === 'KLAIM', fn ($q) => $q->where('activity_type', MarketingEvent::CLAIM_TYPE))
            ->orderByDesc('id')
            ->get();
    }

    /** Detail + 100 peserta pertama (jumlah lengkap di participants_count). */
    public function find(int $id): ?MarketingEvent
    {
        $event = MarketingEvent::with(['budget:id,campaign_code,name', 'creator:id,name', 'attachments', 'approvals.actor:id,name'])
            ->withCount('participants')
            ->find($id);
        if (! $event) {
            return null;
        }

        $event->setRelation(
            'participants',
            $event->participants()->orderBy('customers.name')->limit(100)->get(['customers.id', 'customers.customer_code', 'customers.name', 'customers.city'])
                ->each->makeHidden('pivot')
        );

        return $event;
    }

    public function findClaimProgram(int $id): ?MarketingEvent
    {
        $event = $this->find($id);

        return $event && $event->isClaimProgram() ? $event : null;
    }

    /** Pilihan untuk form: Activity Type, daftar Territory (dari sales aktif), dan pencarian customer. */
    public function options(?string $q = null): array
    {
        $q = trim((string) $q);

        return [
            'activity_types' => $this->pairs('marketing.activity_types'),
            'territories' => User::query()->where('active', true)->where('role', 'sales')->whereNotNull('territory')->where('territory', '!=', '')
                ->distinct()->orderBy('territory')->pluck('territory'),
            'customers' => Customer::query()->where('active', true)
                ->when($q !== '', fn ($c) => $c->where(fn ($w) => $w->where('name', 'like', "%{$q}%")->orWhere('customer_code', 'like', "%{$q}%")))
                ->orderBy('name')->limit(20)->get(['id', 'customer_code', 'name', 'city']),
        ];
    }

    /** Pilihan form Program Klaim: jenis klaim, sumber data, basis, plus Territory dan pencarian customer. */
    public function claimOptions(?string $q = null): array
    {
        $o = $this->options($q);

        return [
            'claim_types' => $this->pairs('marketing.claim_types'),
            'claim_sources' => $this->pairs('marketing.claim_sources'),
            'claim_bases' => $this->pairs('marketing.claim_bases'),
            'territories' => $o['territories'],
            'customers' => $o['customers'],
        ];
    }

    /** @param array<int, UploadedFile> $files */
    public function create(array $data, User $user, array $files = []): MarketingEvent
    {
        return $this->persist($data, $user, $files, 'marketing_event.create');
    }

    /** MKT04: Program Klaim = event dengan Activity Type Klaim + data klaimnya. @param array<int, UploadedFile> $files */
    public function createClaimProgram(array $data, User $user, array $files = []): MarketingEvent
    {
        $data['activity_type'] = MarketingEvent::CLAIM_TYPE;

        return $this->persist($data, $user, $files, 'marketing_claim_program.create');
    }

    private function persist(array $data, User $user, array $files, string $auditAction): MarketingEvent
    {
        return DB::transaction(function () use ($data, $user, $files, $auditAction) {
            $budget = MarketingBudget::whereKey($data['marketing_budget_id'])->lockForUpdate()->firstOrFail();

            if ($budget->status !== 'ACTIVE') {
                throw ValidationException::withMessages(['marketing_budget_id' => 'Campaign ini sudah ditutup, tidak bisa menambah event.']);
            }

            $remaining = (float) $budget->total_budget - (float) $budget->allocated_amount;
            if ((float) $data['budget_amount'] - $remaining > 0.005) {
                throw ValidationException::withMessages([
                    'budget_amount' => 'Budget event melebihi sisa budget Campaign (sisa Rp '.number_format($remaining, 0, ',', '.').').',
                ]);
            }

            $customerIds = $this->resolveParticipants($data);
            if ($customerIds->isEmpty()) {
                throw ValidationException::withMessages(['target_type' => 'Target yang dipilih tidak menghasilkan peserta (tidak ada customer yang cocok).']);
            }

            $event = MarketingEvent::create([
                'marketing_budget_id' => $budget->id,
                'event_seq' => (int) MarketingEvent::where('marketing_budget_id', $budget->id)->max('event_seq') + 1,
                'description' => $data['description'],
                'reference_letter_no' => trim($data['reference_letter_no']),
                'activity_type' => $data['activity_type'],
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                'target_type' => $data['target_type'],
                'target_territories' => $data['target_type'] === 'TERRITORY' ? array_values($data['territories']) : null,
                'budget_amount' => $data['budget_amount'],
                'status' => 'PENDING_APPROVAL',
                'created_by' => $user->id,
            ] + Arr::only($data, self::CLAIM_FIELDS));

            foreach ($customerIds->chunk(500) as $chunk) {
                $event->participants()->attach($chunk->all());
            }
            foreach ($files as $file) {
                $this->storeAttachment($event, $file);
            }

            $this->recalcAllocated($budget);
            $this->auditLogService->log($user->id, $auditAction, MarketingEvent::class, $event->id, null, $event->toArray());

            return $this->find($event->id);
        });
    }

    /**
     * MKT06: event yang ditolak direvisi lalu diajukan ulang. Putaran naik, persetujuan kembali ke tahap 1, budget dicadangkan lagi
     * dan daftar peserta dibentuk ulang dari target. Campaign dan lampiran lama tidak berubah (lampiran baru ditambahkan).
     *
     * @param array<int, UploadedFile> $files
     */
    public function revise(MarketingEvent $event, array $data, User $user, array $files = []): MarketingEvent
    {
        return DB::transaction(function () use ($event, $data, $user, $files) {
            $fresh = MarketingEvent::whereKey($event->id)->lockForUpdate()->firstOrFail();
            if ($fresh->isClaimProgram() || $fresh->status !== 'REJECTED') {
                throw ValidationException::withMessages(['status' => 'Hanya event yang ditolak yang bisa direvisi.']);
            }

            $budget = MarketingBudget::whereKey($fresh->marketing_budget_id)->lockForUpdate()->firstOrFail();
            if ($budget->status !== 'ACTIVE') {
                throw ValidationException::withMessages(['marketing_budget_id' => 'Campaign ini sudah ditutup, event tidak bisa diajukan ulang.']);
            }

            // Event berstatus REJECTED tidak dihitung teralokasi, jadi sisa budget sudah mengecualikan event ini.
            $remaining = (float) $budget->total_budget - (float) $budget->allocated_amount;
            if ((float) $data['budget_amount'] - $remaining > 0.005) {
                throw ValidationException::withMessages([
                    'budget_amount' => 'Budget event melebihi sisa budget Campaign (sisa Rp '.number_format($remaining, 0, ',', '.').').',
                ]);
            }

            $customerIds = $this->resolveParticipants($data);
            if ($customerIds->isEmpty()) {
                throw ValidationException::withMessages(['target_type' => 'Target yang dipilih tidak menghasilkan peserta (tidak ada customer yang cocok).']);
            }

            $old = $fresh->only(['description', 'reference_letter_no', 'activity_type', 'start_date', 'end_date', 'target_type', 'budget_amount', 'approval_round']);
            $fresh->update([
                'description' => $data['description'],
                'reference_letter_no' => trim($data['reference_letter_no']),
                'activity_type' => $data['activity_type'],
                'start_date' => $data['start_date'],
                'end_date' => $data['end_date'],
                'target_type' => $data['target_type'],
                'target_territories' => $data['target_type'] === 'TERRITORY' ? array_values($data['territories']) : null,
                'budget_amount' => $data['budget_amount'],
                'status' => 'PENDING_APPROVAL',
                'approval_stage' => 1,
                'approval_round' => (int) $fresh->approval_round + 1,
            ]);

            $fresh->participants()->sync($customerIds->all());
            foreach ($files as $file) {
                $this->storeAttachment($fresh, $file);
            }

            $this->recalcAllocated($budget);
            $this->auditLogService->log($user->id, 'marketing_event.revise', MarketingEvent::class, $fresh->id, $old, $fresh->fresh()->only(array_keys($old)));

            return $this->find($fresh->id);
        });
    }

    /** Teralokasi = jumlah budget event dan program klaim yang menunggu persetujuan atau disetujui. */
    public function recalcAllocated(MarketingBudget $budget): void
    {
        $sum = MarketingEvent::where('marketing_budget_id', $budget->id)->whereIn('status', MarketingEvent::STATUS_COUNTED)->sum('budget_amount');
        $budget->update(['allocated_amount' => $sum]);
    }

    /** Peserta terbentuk otomatis dari target. Territory dicocokkan lewat territory sales PIC customer. */
    private function resolveParticipants(array $data): Collection
    {
        $customers = Customer::query();

        if ($data['target_type'] === 'CUSTOMER') {
            return $customers->whereIn('id', $data['customer_ids'])->pluck('id');
        }

        $customers->where('active', true);
        if ($data['target_type'] === 'TERRITORY') {
            $salesIds = User::whereIn('territory', $data['territories'])->pluck('id');
            $customers->whereIn('salesperson_id', $salesIds);
        }

        return $customers->pluck('id');
    }

    private function pairs(string $configKey): Collection
    {
        return collect(config($configKey))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values();
    }

    private function storeAttachment(MarketingEvent $event, UploadedFile $file): MarketingEventAttachment
    {
        return MarketingEventAttachment::create([
            'marketing_event_id' => $event->id,
            'path' => $file->store('marketing-events/'.$event->id, 'public'),
            'filename' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize() ?: 0,
        ]);
    }
}