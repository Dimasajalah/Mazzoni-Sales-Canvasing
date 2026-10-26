<?php
namespace App\Services;

use App\Models\MarketingEvent;
use App\Models\MarketingMoveRequest;
use App\Models\MarketingMoveRequestItem;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.15 (MKT14 Move Inventory Request Display Support Event). Urutan: 01 Marketing memeriksa On-Hand Part di Inventory Marketing,
 * 02 Marketing membuat Move Inventory Request dari WH FG ke WH Marketing, 03 Warehouse menjalankan Inventory Transfer (Pra-SJ), 04 Marketing
 * menjalankan Issue Misc. Material, 05 Marketing menginput penerima dan nama event pada Remarks. Langkah di Epicor dikerjakan di luar aplikasi; di sini dicatat.
 */
class MarketingMoveRequestService
{
    /** Jenis permintaan: DISPLAY_EVENT (MKT14, terkait event) atau SAMPLE_INTERNAL (MKT15, tanpa event; langkah 05 mencatat nama sales dan peruntukannya). */
    private string $type = 'DISPLAY_EVENT';

    private const WITH = [
        'event:id,marketing_budget_id,event_seq,activity_type,description,start_date,end_date,status', 'event.budget:id,campaign_code', 'items', 'creator:id,name',
    ];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /** Salinan layanan ini untuk jenis permintaan lain (mis. SAMPLE_INTERNAL). */
    public function forType(string $type): static
    {
        $copy = clone $this;
        $copy->type = $type;

        return $copy;
    }

    private function isSample(): bool
    {
        return $this->type === 'SAMPLE_INTERNAL';
    }

    // ------------------------------------------------------------- peran

    public function eligible(User $user, string $role): bool
    {
        return in_array($user->role, (array) config("marketing.move_request.roles.{$role}", []), true);
    }

    public function hasAccess(User $user): bool
    {
        return $this->eligible($user, 'marketing') || $this->eligible($user, 'warehouse');
    }

    // ------------------------------------------------------------- baca

    /** Event yang bisa didukung barang display: event (bukan klaim) yang sudah disetujui. */
    public function eventOptions(): Collection
    {
        return MarketingEvent::query()->with('budget:id,campaign_code')->where('activity_type', 'EVENT')->where('status', 'APPROVED')
            ->orderByDesc('id')->get(['id', 'marketing_budget_id', 'event_seq', 'activity_type', 'description', 'start_date', 'end_date'])
            ->map(fn (MarketingEvent $e) => ['id' => $e->id, 'event_code' => $e->event_code, 'description' => $e->description, 'start_date' => $e->start_date ? substr((string) $e->start_date, 0, 10) : null, 'end_date' => $e->end_date ? substr((string) $e->end_date, 0, 10) : null]);
    }

    public function list(User $user, ?string $q = null): Collection
    {
        $q = trim((string) $q);
        $rows = MarketingMoveRequest::query()->where('type', $this->type)->with(['event:id,marketing_budget_id,event_seq,activity_type,description', 'event.budget:id,campaign_code'])
            ->withCount('items')
            ->when($q !== '', fn ($x) => $x->where(fn ($w) => $w->where('req_no', 'like', "%{$q}%")
                ->orWhereHas('event', fn ($e) => $e->where('description', 'like', "%{$q}%"))))
            ->orderByDesc('id')->get();

        return $rows->each(function (MarketingMoveRequest $r) use ($user) {
            $r->setAttribute('awaiting_label', $this->awaitingLabel($r));
            $r->setAttribute('can_act', in_array(true, $this->flags($r, $user), true));
        });
    }

    public function find(int $id, User $user): ?MarketingMoveRequest
    {
        $r = MarketingMoveRequest::query()->where('type', $this->type)->with(self::WITH)->find($id);
        if (! $r) {
            return null;
        }

        $r->setAttribute('flags', $this->flags($r, $user));
        $r->setAttribute('awaiting_label', $this->awaitingLabel($r));

        return $r;
    }

    private function flags(MarketingMoveRequest $r, User $user): array
    {
        $marketing = $this->eligible($user, 'marketing');
        $warehouse = $this->eligible($user, 'warehouse');

        return [
            'can_edit' => $r->status === 'NEW' && $marketing,
            'can_check' => $r->status === 'NEW' && $marketing,
            'can_request' => $r->status === 'CHECKED' && $marketing,
            'can_transfer' => $r->status === 'REQUESTED' && $warehouse,
            'can_issue' => $r->status === 'TRANSFERRED' && $marketing,
            'can_complete' => $r->status === 'ISSUED' && $marketing,
        ];
    }

    private function awaitingLabel(MarketingMoveRequest $r): ?string
    {
        return match ($r->status) {
            'NEW' => 'Marketing (cek On-Hand di Inventory Marketing)',
            'CHECKED' => 'Marketing (buat Move Inventory Request)',
            'REQUESTED' => 'Warehouse (Inventory Transfer)',
            'TRANSFERRED' => 'Marketing (Issue Misc. Material)',
            'ISSUED' => $this->isSample() ? 'Marketing (input nama sales dan peruntukannya)' : 'Marketing (input penerima dan nama event)',
            default => null,
        };
    }

    // ------------------------------------------------------------- tulis

    /** @param array{event_id: int|string, notes?: ?string, items: array<int, array<string, mixed>>} $data */
    public function create(User $user, array $data): MarketingMoveRequest
    {
        $this->requireRole($this->eligible($user, 'marketing'), 'Move Inventory Request dibuat oleh Marketing.');

        return DB::transaction(function () use ($user, $data) {
            $event = $this->isSample() ? null : $this->selectableEvent((int) $data['event_id']);
            $items = $this->normalizeItems($data['items']);

            $r = MarketingMoveRequest::create([
                'req_no' => $this->nextNumber(), 'type' => $this->type, 'marketing_event_id' => $event?->id, 'notes' => $data['notes'] ?? null, 'status' => 'NEW', 'created_by' => $user->id,
            ]);
            $this->replaceItems($r, $items);
            $this->audit($user, 'create', $r, null, ['req_no' => $r->req_no, 'type' => $this->type, 'event' => $event?->id, 'items' => count($items)]);

            return $this->find($r->id, $user);
        });
    }

    /** Header dan barang bisa diubah selama On-Hand belum diperiksa. */
    public function update(MarketingMoveRequest $r, User $user, array $data): MarketingMoveRequest
    {
        return DB::transaction(function () use ($r, $user, $data) {
            $fresh = $this->lock($r);
            $this->requireStatus($fresh, ['NEW'], 'Permintaan hanya bisa diubah sebelum On-Hand diperiksa.');
            $this->requireRole($this->eligible($user, 'marketing'), 'Move Inventory Request diubah oleh Marketing.');

            $event = $this->isSample() ? null : $this->selectableEvent((int) $data['event_id']);
            $items = $this->normalizeItems($data['items']);
            $fresh->update(['marketing_event_id' => $event?->id, 'notes' => $data['notes'] ?? null]);
            $this->replaceItems($fresh, $items);
            $this->audit($user, 'update', $fresh, null, ['event' => $event?->id, 'items' => count($items)]);

            return $this->find($fresh->id, $user);
        });
    }

    /**
     * Langkah 01: hasil Check On-Hand Part di Inventory Marketing untuk setiap barang (boleh 0).
     *
     * @param array<int, array{item_id: int|string, onhand_qty: float|int|string}> $onhand
     */
    public function checkOnHand(MarketingMoveRequest $r, User $user, array $onhand, ?string $notes): MarketingMoveRequest
    {
        return DB::transaction(function () use ($r, $user, $onhand, $notes) {
            $fresh = $this->lock($r);
            $this->requireStatus($fresh, ['NEW'], 'On-Hand hanya diperiksa sekali, setelah permintaan dibuat.');
            $this->requireRole($this->eligible($user, 'marketing'), 'Check On-Hand dilakukan oleh Marketing.');

            $byItem = [];
            foreach ($onhand as $o) {
                $byItem[(int) $o['item_id']] = round((float) $o['onhand_qty'], 2);
            }
            $items = MarketingMoveRequestItem::where('marketing_move_request_id', $fresh->id)->get();
            foreach ($items as $item) {
                if (! isset($byItem[$item->id]) || $byItem[$item->id] < 0) {
                    throw ValidationException::withMessages(['onhand' => 'Isi On-Hand di Inventory Marketing untuk semua barang (boleh 0, tidak boleh negatif).']);
                }
            }
            foreach ($items as $item) {
                $item->update(['onhand_qty' => $byItem[$item->id]]);
            }

            $fresh->update(['status' => 'CHECKED', 'onhand_notes' => $notes, 'onhand_checked_by' => $user->id, 'onhand_checked_at' => now()]);
            $this->audit($user, 'onhand', $fresh, ['status' => 'NEW'], ['status' => 'CHECKED']);

            return $this->find($fresh->id, $user);
        });
    }

    /** Langkah 02: nomor Move Inventory Request dari WH FG ke WH Marketing (dibuat di Epicor). */
    public function recordRequest(MarketingMoveRequest $r, User $user, string $number): MarketingMoveRequest
    {
        return DB::transaction(function () use ($r, $user, $number) {
            $fresh = $this->lock($r);
            $this->requireStatus($fresh, ['CHECKED'], 'Move Inventory Request dicatat setelah On-Hand diperiksa.');
            $this->requireRole($this->eligible($user, 'marketing'), 'Move Inventory Request dibuat oleh Marketing.');

            $number = trim($number);
            if (MarketingMoveRequest::where('epicor_request_no', $number)->where('id', '!=', $fresh->id)->exists()) {
                throw ValidationException::withMessages(['epicor_request_no' => 'Nomor Move Inventory Request '.$number.' sudah dipakai permintaan lain.']);
            }

            $fresh->update(['epicor_request_no' => $number, 'status' => 'REQUESTED', 'requested_by' => $user->id, 'requested_at' => now()]);
            $this->audit($user, 'request', $fresh, ['status' => 'CHECKED'], ['status' => 'REQUESTED', 'epicor_request_no' => $number]);

            return $this->find($fresh->id, $user);
        });
    }

    /** Langkah 03: Warehouse menjalankan Inventory Transfer sesuai request (Dokumen: Pra-SJ). */
    public function recordTransfer(MarketingMoveRequest $r, User $user, string $praSj): MarketingMoveRequest
    {
        return DB::transaction(function () use ($r, $user, $praSj) {
            $fresh = $this->lock($r);
            $this->requireStatus($fresh, ['REQUESTED'], 'Inventory Transfer dicatat setelah Move Inventory Request dibuat.');
            $this->requireRole($this->eligible($user, 'warehouse'), 'Inventory Transfer dijalankan oleh Warehouse.');

            $praSj = trim($praSj);
            if (MarketingMoveRequest::where('pra_sj_number', $praSj)->where('id', '!=', $fresh->id)->exists()) {
                throw ValidationException::withMessages(['pra_sj_number' => 'Nomor Pra-SJ '.$praSj.' sudah dipakai permintaan lain.']);
            }

            $fresh->update(['pra_sj_number' => $praSj, 'status' => 'TRANSFERRED', 'transferred_by' => $user->id, 'transferred_at' => now()]);
            $this->audit($user, 'transfer', $fresh, ['status' => 'REQUESTED'], ['status' => 'TRANSFERRED', 'pra_sj' => $praSj]);

            return $this->find($fresh->id, $user);
        });
    }

    /** Langkah 04: Issue Misc. Material mengeluarkan barang dari stok Marketing. */
    public function recordIssue(MarketingMoveRequest $r, User $user, string $reference): MarketingMoveRequest
    {
        return DB::transaction(function () use ($r, $user, $reference) {
            $fresh = $this->lock($r);
            $this->requireStatus($fresh, ['TRANSFERRED'], 'Issue Misc. Material dicatat setelah Inventory Transfer.');
            $this->requireRole($this->eligible($user, 'marketing'), 'Issue Misc. Material dijalankan oleh Marketing.');

            $fresh->update(['issue_reference' => trim($reference), 'status' => 'ISSUED', 'issued_by' => $user->id, 'issued_at' => now()]);
            $this->audit($user, 'issue', $fresh, ['status' => 'TRANSFERRED'], ['status' => 'ISSUED', 'issue_reference' => trim($reference)]);

            return $this->find($fresh->id, $user);
        });
    }

    /**
     * Langkah 05. Display event: nama penerima dan nama event pada Remarks. Sample internal: nama sales dan peruntukannya pada Remarks.
     */
    public function complete(MarketingMoveRequest $r, User $user, string $recipient, ?string $purpose = null): MarketingMoveRequest
    {
        return DB::transaction(function () use ($r, $user, $recipient, $purpose) {
            $fresh = $this->lock($r);
            $this->requireStatus($fresh, ['ISSUED'], 'Remarks diisi setelah Issue Misc. Material.');
            $this->requireRole($this->eligible($user, 'marketing'), 'Remarks diisi oleh Marketing.');

            $recipient = trim($recipient);
            if ($this->isSample()) {
                $purpose = trim((string) $purpose);
                if ($purpose === '') {
                    throw ValidationException::withMessages(['purpose' => 'Isi peruntukan sample.']);
                }
                $label = $purpose;
            } else {
                $purpose = null;
                $label = (string) MarketingEvent::whereKey($fresh->marketing_event_id)->value('description');
            }
            $fresh->update([
                'recipient_name' => $recipient, 'purpose' => $purpose, 'remarks' => mb_substr($recipient.' / '.$label, 0, 255), 'status' => 'DONE', 'completed_by' => $user->id, 'completed_at' => now(),
            ]);
            $this->audit($user, 'complete', $fresh, ['status' => 'ISSUED'], ['status' => 'DONE', 'remarks' => $fresh->remarks]);

            return $this->find($fresh->id, $user);
        });
    }

    // ------------------------------------------------------------- pembantu

    private function lock(MarketingMoveRequest $r): MarketingMoveRequest
    {
        return MarketingMoveRequest::whereKey($r->id)->lockForUpdate()->firstOrFail();
    }

    private function requireStatus(MarketingMoveRequest $r, array $statuses, string $message): void
    {
        if (! in_array($r->status, $statuses, true)) {
            throw ValidationException::withMessages(['status' => $message]);
        }
    }

    private function requireRole(bool $ok, string $message): void
    {
        if (! $ok) {
            throw new AuthorizationException($message);
        }
    }

    private function selectableEvent(int $id): MarketingEvent
    {
        $event = MarketingEvent::query()->where('activity_type', 'EVENT')->where('status', 'APPROVED')->find($id);
        if (! $event) {
            throw ValidationException::withMessages(['event_id' => 'Pilih event yang sudah disetujui.']);
        }

        return $event;
    }

    /** @return array<int, array<string, mixed>> */
    private function normalizeItems(array $items): array
    {
        $max = (int) config('marketing.move_request.max_items', 20);
        if (count($items) < 1 || count($items) > $max) {
            throw ValidationException::withMessages(['items' => 'Isi 1 sampai '.$max.' barang display.']);
        }

        $rows = [];
        foreach ($items as $i) {
            $part = trim((string) ($i['part_num'] ?? ''));
            $qty = round((float) ($i['qty'] ?? 0), 2);
            $key = mb_strtolower($part);
            if ($part === '') {
                throw ValidationException::withMessages(['items' => 'Kode part wajib diisi.']);
            }
            if (isset($rows[$key])) {
                throw ValidationException::withMessages(['items' => 'Kode part '.$part.' diisi lebih dari sekali.']);
            }
            if ($qty <= 0) {
                throw ValidationException::withMessages(['items' => 'Jumlah barang '.$part.' harus lebih dari 0.']);
            }
            if (! $this->partExists($part)) {
                throw ValidationException::withMessages(['items' => 'Kode part '.$part.' tidak ada di Part Master.']);
            }
            $rows[$key] = ['part_num' => $part, 'qty' => $qty, 'description' => isset($i['description']) ? (trim((string) $i['description']) ?: null) : null];
        }

        return array_values($rows);
    }

    private function replaceItems(MarketingMoveRequest $r, array $rows): void
    {
        MarketingMoveRequestItem::where('marketing_move_request_id', $r->id)->delete();
        foreach ($rows as $row) {
            MarketingMoveRequestItem::create($row + ['marketing_move_request_id' => $r->id]);
        }
    }

    private function nextNumber(): string
    {
        $prefix = ($this->isSample() ? 'SM-' : 'MV-').now()->format('Y').'-';
        $last = MarketingMoveRequest::where('req_no', 'like', $prefix.'%')->lockForUpdate()->orderByDesc('req_no')->value('req_no');

        return $prefix.str_pad((string) ($last ? ((int) substr($last, strlen($prefix))) + 1 : 1), 5, '0', STR_PAD_LEFT);
    }

    /** Kode part harus ada di Part Master (kolom yang sama dengan validasi upload sell out). */
    private function partExists(string $code): bool
    {
        foreach ((array) config('marketing.sellout.part_columns') as $col) {
            if (! preg_match('/^[a-z_]+$/', (string) $col) || ! Schema::hasColumn('products', $col)) {
                continue;
            }
            if (DB::table('products')->whereRaw('LOWER('.$col.') = ?', [mb_strtolower($code)])->exists()) {
                return true;
            }
        }

        return false;
    }

    private function audit(User $user, string $step, MarketingMoveRequest $r, ?array $old, array $new): void
    {
        $this->auditLogService->log($user->id, 'marketing_move_request.'.$step, MarketingMoveRequest::class, $r->id, $old, $new);
    }
}