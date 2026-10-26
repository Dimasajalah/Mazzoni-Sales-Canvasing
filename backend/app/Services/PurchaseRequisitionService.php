<?php
namespace App\Services;

use App\Models\PurchaseRequisition;
use App\Models\PurchaseRequisitionApproval;
use App\Models\PurchaseRequisitionAttachment;
use App\Models\PurchaseRequisitionLine;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.14 (PR01 Requisition User, Reward dan Design). Alur: 01 User mengisi header (tanggal barang dibutuhkan), 02 Add Line
 * (part number dan RAB/gambar terlampir); part yang belum terdaftar di Part Master didaftarkan IT (03) dulu. Bila termasuk RAB/Bulanan,
 * PIC Dept memperbarui harga purchasing (04). 05 Manager Dept menyetujui; bila barang asset atau lebih dari 30 juta, 06 Direktur ikut menyetujui.
 * Bila tidak disetujui, 07 PIC Dept merevisi dan diajukan ulang ke Manager Dept. 08 Purchasing melakukan Dispatch Approval lalu meneruskannya
 * ke PO BOP Supplier, PO BOP Lapangan, atau PO RMPM Lapangan (09-11).
 */
class PurchaseRequisitionService
{
    private const WITH = ['requester:id,name', 'lines', 'attachments', 'approvals.actor:id,name'];

    private const ROLES = ['user', 'pic', 'manager', 'director', 'purchasing', 'it'];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    // ------------------------------------------------------------- peran

    /** Apakah pengguna menjalankan peran itu di diagram (berdasarkan role atau email di konfigurasi). */
    public function eligible(User $user, string $role): bool
    {
        $roles = (array) config("marketing.purchase_requisition.roles.{$role}", []);
        $emails = array_map('mb_strtolower', (array) config("marketing.purchase_requisition.emails.{$role}", []));

        return in_array($user->role, $roles, true) || in_array(mb_strtolower((string) $user->email), $emails, true);
    }

    public function hasAccess(User $user): bool
    {
        foreach (self::ROLES as $role) {
            if ($this->eligible($user, $role)) {
                return true;
            }
        }

        return false;
    }

    /** Pengguna yang hanya berperan sebagai User melihat PR miliknya sendiri; peran lain melihat semua PR. */
    private function seesAll(User $user): bool
    {
        foreach (['pic', 'manager', 'director', 'purchasing', 'it'] as $role) {
            if ($this->eligible($user, $role)) {
                return true;
            }
        }

        return false;
    }

    private function visible(User $user)
    {
        return PurchaseRequisition::query()->when(! $this->seesAll($user), fn ($q) => $q->where('requested_by', $user->id));
    }

    // ------------------------------------------------------------- baca

    public function list(User $user, ?string $scope = null, ?string $q = null): Collection
    {
        $q = trim((string) $q);
        $items = $this->visible($user)->with(['requester:id,name', 'lines:id,purchase_requisition_id,part_registered'])->withCount('lines')
            ->when($q !== '', fn ($x) => $x->where(fn ($w) => $w->where('pr_no', 'like', "%{$q}%")->orWhere('notes', 'like', "%{$q}%")
                ->orWhereHas('requester', fn ($r) => $r->where('name', 'like', "%{$q}%"))))
            ->orderByDesc('id')->get();

        $items->each(function (PurchaseRequisition $pr) use ($user) {
            $flags = $this->flags($pr, $user);
            $pr->setAttribute('awaiting_label', $this->awaitingLabel($pr));
            $pr->setAttribute('can_act', $this->needsMyAction($flags));
            $pr->setAttribute('unregistered_count', $pr->lines->where('part_registered', false)->count());
            $pr->unsetRelation('lines');
        });

        return $items->filter(fn (PurchaseRequisition $pr) => match ($scope) {
            'mine' => $pr->requested_by === $user->id,
            'todo' => $pr->can_act,
            default => true,
        })->values();
    }

    public function find(int $id, User $user): ?PurchaseRequisition
    {
        $pr = $this->visible($user)->with(self::WITH)->find($id);

        return $pr ? $this->decorate($pr, $user) : null;
    }

    private function decorate(PurchaseRequisition $pr, User $user): PurchaseRequisition
    {
        $flags = $this->flags($pr, $user);
        $showDirector = $pr->requires_director || $pr->approvals->where('round', $pr->approval_round)->contains('stage', 2);
        $levels = [['stage' => 1, 'label' => 'Manager Dept']];
        if ($showDirector) {
            $levels[] = ['stage' => 2, 'label' => 'Direktur'];
        }

        $pr->setAttribute('flags', $flags);
        $pr->setAttribute('awaiting_label', $this->awaitingLabel($pr));
        $pr->setAttribute('unregistered_count', $pr->lines->where('part_registered', false)->count());
        $pr->setAttribute('approval', [
            'stage' => $pr->approval_stage, 'round' => $pr->approval_round, 'levels' => $levels,
            'awaiting_label' => in_array($pr->status, ['MANAGER', 'DIRECTOR'], true) ? $this->awaitingLabel($pr) : null,
            'can_act' => $flags['can_decide'],
            'reason_codes' => ['APPROVE' => $this->codes('APPROVE'), 'REJECT' => $this->codes('REJECT')],
        ]);
        $pr->setAttribute('options', [
            'categories' => $this->options('categories'), 'dispatch_targets' => $this->options('dispatch_targets'),
            'asset_threshold' => (float) config('marketing.purchase_requisition.asset_threshold'),
            'max_lines' => (int) config('marketing.purchase_requisition.max_lines'),
        ]);

        return $pr;
    }

    /** Tindakan yang boleh dilakukan pengguna ini pada PR sekarang. */
    private function flags(PurchaseRequisition $pr, User $user): array
    {
        $s = $pr->status;
        $owner = $pr->requested_by === $user->id;
        $pic = $this->eligible($user, 'pic');
        $hasUnregistered = $pr->relationLoaded('lines') && $pr->lines->contains(fn ($l) => ! $l->part_registered);

        return [
            'can_edit' => ($s === 'DRAFT' && ($owner || $pic)) || ($s === 'REVISION' && $pic),
            'can_submit' => $s === 'DRAFT' && ($owner || $pic),
            'can_register' => in_array($s, ['DRAFT', 'REVISION'], true) && $this->eligible($user, 'it') && $hasUnregistered,
            'can_price' => $s === 'PRICING' && $pic,
            'can_decide' => ($s === 'MANAGER' && $this->eligible($user, 'manager')) || ($s === 'DIRECTOR' && $this->eligible($user, 'director')),
            'can_resubmit' => $s === 'REVISION' && $pic,
            'can_dispatch' => $s === 'PURCHASING' && $this->eligible($user, 'purchasing'),
        ];
    }

    private function needsMyAction(array $flags): bool
    {
        return $flags['can_submit'] || $flags['can_register'] || $flags['can_price'] || $flags['can_decide'] || $flags['can_resubmit'] || $flags['can_dispatch'];
    }

    private function awaitingLabel(PurchaseRequisition $pr): ?string
    {
        return match ($pr->status) {
            'DRAFT' => $pr->relationLoaded('lines') && $pr->lines->contains(fn ($l) => ! $l->part_registered) ? 'IT (Register New Part)' : 'User (menyiapkan PR)',
            'PRICING' => 'PIC Dept (update harga purchasing)',
            'MANAGER' => 'Manager Dept',
            'DIRECTOR' => 'Direktur',
            'REVISION' => 'PIC Dept (revisi PR)',
            'PURCHASING' => 'Purchasing',
            default => null,
        };
    }

    // ------------------------------------------------------------- langkah 01-02: isi PR

    /** @param array<string, mixed> $data */
    public function create(User $user, array $data): PurchaseRequisition
    {
        if (! $this->eligible($user, 'user')) {
            throw new AuthorizationException('Anda tidak berperan sebagai User pengaju requisition.');
        }

        return DB::transaction(function () use ($user, $data) {
            $lines = $this->normalizeLines($data['lines']);
            $pr = PurchaseRequisition::create([
                'pr_no' => $this->nextNumber(), 'category' => $data['category'], 'needed_date' => $data['needed_date'],
                'is_rab' => (bool) ($data['is_rab'] ?? false), 'notes' => $data['notes'] ?? null, 'status' => 'DRAFT', 'requested_by' => $user->id,
            ]);
            $this->replaceLines($pr, $lines);
            $this->refreshDecisionFields($pr);
            $this->audit($user, 'create', $pr, null, ['pr_no' => $pr->pr_no, 'category' => $pr->category, 'lines' => count($lines)]);

            return $this->find($pr->id, $user);
        });
    }

    /** Mengubah header dan baris selama PR masih Draft (oleh pembuat atau PIC Dept) atau dalam Revisi (oleh PIC Dept). */
    public function update(PurchaseRequisition $pr, User $user, array $data): PurchaseRequisition
    {
        return DB::transaction(function () use ($pr, $user, $data) {
            $fresh = $this->lock($pr);
            $this->assertCanEdit($fresh, $user);

            $lines = $this->normalizeLines($data['lines']);
            $fresh->update([
                'category' => $data['category'], 'needed_date' => $data['needed_date'], 'is_rab' => (bool) ($data['is_rab'] ?? false), 'notes' => $data['notes'] ?? null,
            ]);
            $this->replaceLines($fresh, $lines);
            $this->refreshDecisionFields($fresh);
            $this->audit($user, 'update', $fresh, null, ['lines' => count($lines), 'total' => $fresh->total_amount]);

            return $this->find($fresh->id, $user);
        });
    }

    /** @param array<int, UploadedFile> $files */
    public function addAttachments(PurchaseRequisition $pr, User $user, array $files): PurchaseRequisition
    {
        return DB::transaction(function () use ($pr, $user, $files) {
            $fresh = $this->lock($pr);
            $this->assertCanEdit($fresh, $user);

            foreach ($files as $file) {
                PurchaseRequisitionAttachment::create([
                    'purchase_requisition_id' => $fresh->id, 'kind' => 'RAB', 'path' => $file->store('purchase-requisitions/'.$fresh->id, 'public'),
                    'filename' => $file->getClientOriginalName(), 'mime' => $file->getClientMimeType(), 'size' => $file->getSize() ?: 0,
                ]);
            }
            $this->audit($user, 'attachments', $fresh, null, ['files' => count($files)]);

            return $this->find($fresh->id, $user);
        });
    }

    /** Mengajukan PR: RAB/Bulanan ke PIC Dept untuk update harga (04); selain itu langsung ke Manager Dept (05). */
    public function submit(PurchaseRequisition $pr, User $user): PurchaseRequisition
    {
        return DB::transaction(function () use ($pr, $user) {
            $fresh = $this->lock($pr);
            $this->requireStatus($fresh, ['DRAFT'], 'PR ini sudah diajukan.');
            if ($fresh->requested_by !== $user->id && ! $this->eligible($user, 'pic')) {
                throw new AuthorizationException('PR hanya diajukan oleh pembuatnya atau PIC Dept.');
            }
            $this->assertReadyToSend($fresh);
            if ($fresh->is_rab && $fresh->attachments()->count() === 0) {
                throw ValidationException::withMessages(['attachments' => 'Lampirkan RAB atau gambar barang untuk pengajuan RAB/Bulanan.']);
            }

            $fresh->update(['status' => $fresh->is_rab ? 'PRICING' : 'MANAGER', 'approval_stage' => 1, 'submitted_at' => now()]);
            $this->refreshDecisionFields($fresh);
            $this->audit($user, 'submit', $fresh, ['status' => 'DRAFT'], ['status' => $fresh->status]);

            return $this->find($fresh->id, $user);
        });
    }

    // ------------------------------------------------------------- langkah 03: IT mendaftarkan part baru

    /** IT mendaftarkan part baru ke Part Master (di luar aplikasi), lalu mencatat kode terdaftarnya pada baris itu. */
    public function registerPart(PurchaseRequisition $pr, int $lineId, string $partNum, User $user): PurchaseRequisition
    {
        return DB::transaction(function () use ($pr, $lineId, $partNum, $user) {
            $fresh = $this->lock($pr);
            $this->requireStatus($fresh, ['DRAFT', 'REVISION'], 'Part hanya didaftarkan selama PR masih Draft atau Revisi.');
            if (! $this->eligible($user, 'it')) {
                throw new AuthorizationException('Register New Part dilakukan oleh IT.');
            }

            $line = PurchaseRequisitionLine::where('purchase_requisition_id', $fresh->id)->whereKey($lineId)->first();
            if (! $line || $line->part_registered) {
                throw ValidationException::withMessages(['line' => 'Baris ini tidak sedang menunggu pendaftaran part.']);
            }

            $code = trim($partNum);
            if (! $this->partExists($code)) {
                throw ValidationException::withMessages(['part_num' => 'Kode part '.$code.' belum ada di Part Master. Daftarkan dulu di Epicor dan pastikan Part Master sudah tersinkron.']);
            }
            $duplicate = PurchaseRequisitionLine::where('purchase_requisition_id', $fresh->id)->where('id', '!=', $line->id)->whereRaw('LOWER(part_num) = ?', [mb_strtolower($code)])->exists();
            if ($duplicate) {
                throw ValidationException::withMessages(['part_num' => 'Kode part '.$code.' sudah ada di baris lain pada PR ini.']);
            }

            $line->update(['part_num' => $code, 'part_registered' => true, 'registered_by' => $user->id, 'registered_at' => now()]);
            $this->audit($user, 'register_part', $fresh, null, ['line' => $line->line_no, 'part' => $code]);

            return $this->find($fresh->id, $user);
        });
    }

    // ------------------------------------------------------------- langkah 04: harga purchasing

    /**
     * PIC Dept memperbarui harga purchasing (RAB/Bulanan). Semua baris wajib berharga; setelah itu PR ke Manager Dept.
     *
     * @param array<int, array{line_id: int|string, unit_price: float|int|string}> $prices
     */
    public function updatePrices(PurchaseRequisition $pr, array $prices, User $user): PurchaseRequisition
    {
        return DB::transaction(function () use ($pr, $prices, $user) {
            $fresh = $this->lock($pr);
            $this->requireStatus($fresh, ['PRICING'], 'Harga purchasing hanya diperbarui untuk PR RAB/Bulanan yang menunggu PIC Dept.');
            if (! $this->eligible($user, 'pic')) {
                throw new AuthorizationException('Harga purchasing diperbarui oleh PIC Dept.');
            }

            $byLine = [];
            foreach ($prices as $p) {
                $byLine[(int) $p['line_id']] = round((float) $p['unit_price'], 2);
            }
            $lines = PurchaseRequisitionLine::where('purchase_requisition_id', $fresh->id)->get();
            foreach ($lines as $line) {
                if (! isset($byLine[$line->id]) || $byLine[$line->id] <= 0) {
                    throw ValidationException::withMessages(['prices' => 'Harga satuan semua baris wajib diisi lebih dari 0.']);
                }
            }
            foreach ($lines as $line) {
                $line->update(['unit_price' => $byLine[$line->id]]);
            }

            $fresh->update(['status' => 'MANAGER', 'approval_stage' => 1, 'priced_by' => $user->id, 'priced_at' => now()]);
            $this->refreshDecisionFields($fresh);
            $this->audit($user, 'prices', $fresh, ['status' => 'PRICING'], ['status' => 'MANAGER', 'total' => $fresh->total_amount]);

            return $this->find($fresh->id, $user);
        });
    }

    // ------------------------------------------------------------- langkah 05-07: persetujuan dan revisi

    /**
     * Manager Dept (tahap 1) lalu, bila barang asset atau lebih dari batas, Direktur (tahap 2). Menolak mengembalikan PR ke PIC Dept untuk revisi.
     *
     * @param 'APPROVE'|'REJECT' $type
     */
    public function decide(PurchaseRequisition $pr, User $user, string $type, string $reasonCode, ?string $notes = null): PurchaseRequisition
    {
        return DB::transaction(function () use ($pr, $user, $type, $reasonCode, $notes) {
            $fresh = $this->lock($pr);
            $this->requireStatus($fresh, ['MANAGER', 'DIRECTOR'], 'PR ini tidak sedang menunggu persetujuan.');
            $stage = $fresh->status === 'MANAGER' ? 1 : 2;
            $label = $stage === 1 ? 'Manager Dept' : 'Direktur';
            if (! $this->eligible($user, $stage === 1 ? 'manager' : 'director')) {
                throw new AuthorizationException('Anda bukan pemberi persetujuan Tahap '.$stage.' ('.$label.').');
            }

            PurchaseRequisitionApproval::create([
                'purchase_requisition_id' => $fresh->id, 'round' => $fresh->approval_round, 'stage' => $stage, 'stage_label' => $label,
                'action' => $type === 'APPROVE' ? 'APPROVED' : 'REJECTED', 'reason_code' => $reasonCode, 'notes' => $notes, 'acted_by' => $user->id, 'acted_at' => now(),
            ]);

            if ($type === 'REJECT') {
                $fresh->update(['status' => 'REVISION']);
            } elseif ($stage === 1) {
                $this->refreshDecisionFields($fresh);
                $fresh->update($fresh->requires_director ? ['status' => 'DIRECTOR', 'approval_stage' => 2] : ['status' => 'PURCHASING']);
            } else {
                $fresh->update(['status' => 'PURCHASING']);
            }

            $this->audit($user, $type === 'APPROVE' ? 'approve' : 'reject', $fresh, ['status' => $stage === 1 ? 'MANAGER' : 'DIRECTOR'], ['status' => $fresh->status, 'reason_code' => $reasonCode]);

            return $this->find($fresh->id, $user);
        });
    }

    /** PIC Dept mengajukan ulang PR yang sudah direvisi ke Manager Dept (putaran persetujuan naik). */
    public function resubmit(PurchaseRequisition $pr, User $user): PurchaseRequisition
    {
        return DB::transaction(function () use ($pr, $user) {
            $fresh = $this->lock($pr);
            $this->requireStatus($fresh, ['REVISION'], 'Hanya PR yang sedang direvisi yang bisa diajukan ulang.');
            if (! $this->eligible($user, 'pic')) {
                throw new AuthorizationException('Revisi PR dikerjakan oleh PIC Dept.');
            }
            $this->assertReadyToSend($fresh);

            $fresh->update(['status' => 'MANAGER', 'approval_stage' => 1, 'approval_round' => $fresh->approval_round + 1]);
            $this->refreshDecisionFields($fresh);
            $this->audit($user, 'resubmit', $fresh, ['status' => 'REVISION'], ['status' => 'MANAGER', 'round' => $fresh->approval_round]);

            return $this->find($fresh->id, $user);
        });
    }

    // ------------------------------------------------------------- langkah 08-11: Purchasing

    /** Purchasing melakukan Dispatch Approval lalu meneruskan PR menjadi PO BOP Supplier, PO BOP Lapangan, atau PO RMPM Lapangan. */
    public function dispatch(PurchaseRequisition $pr, string $target, User $user): PurchaseRequisition
    {
        return DB::transaction(function () use ($pr, $target, $user) {
            $fresh = $this->lock($pr);
            $this->requireStatus($fresh, ['PURCHASING'], 'PR ini belum disetujui atau sudah diteruskan.');
            if (! $this->eligible($user, 'purchasing')) {
                throw new AuthorizationException('Dispatch Approval dilakukan oleh Purchasing.');
            }
            if (! array_key_exists($target, (array) config('marketing.purchase_requisition.dispatch_targets'))) {
                throw ValidationException::withMessages(['target' => 'Pilih tujuan PO: PO BOP Supplier, PO BOP Lapangan, atau PO RMPM Lapangan.']);
            }

            $fresh->update(['status' => 'DISPATCHED', 'dispatch_target' => $target, 'dispatched_by' => $user->id, 'dispatched_at' => now()]);
            $this->audit($user, 'dispatch', $fresh, ['status' => 'PURCHASING'], ['status' => 'DISPATCHED', 'target' => $target]);

            return $this->find($fresh->id, $user);
        });
    }

    // ------------------------------------------------------------- pembantu

    private function lock(PurchaseRequisition $pr): PurchaseRequisition
    {
        return PurchaseRequisition::whereKey($pr->id)->lockForUpdate()->firstOrFail();
    }

    private function requireStatus(PurchaseRequisition $pr, array $statuses, string $message): void
    {
        if (! in_array($pr->status, $statuses, true)) {
            throw ValidationException::withMessages(['status' => $message]);
        }
    }

    private function assertCanEdit(PurchaseRequisition $pr, User $user): void
    {
        $this->requireStatus($pr, ['DRAFT', 'REVISION'], 'PR hanya bisa diubah selama masih Draft atau Revisi.');
        $owner = $pr->requested_by === $user->id;
        $pic = $this->eligible($user, 'pic');
        if (! (($pr->status === 'DRAFT' && ($owner || $pic)) || ($pr->status === 'REVISION' && $pic))) {
            throw new AuthorizationException($pr->status === 'DRAFT' ? 'PR Draft hanya diubah pembuatnya atau PIC Dept.' : 'Revisi PR dikerjakan oleh PIC Dept.');
        }
    }

    /** PR belum boleh dikirim ke persetujuan selama masih ada part yang belum terdaftar di Part Master (menunggu IT). */
    private function assertReadyToSend(PurchaseRequisition $pr): void
    {
        $lines = PurchaseRequisitionLine::where('purchase_requisition_id', $pr->id)->get();
        if ($lines->isEmpty()) {
            throw ValidationException::withMessages(['lines' => 'PR harus memuat minimal satu baris.']);
        }
        $pending = $lines->where('part_registered', false);
        if ($pending->isNotEmpty()) {
            throw ValidationException::withMessages(['lines' => 'Masih ada part yang belum terdaftar (menunggu IT): '.$pending->pluck('part_num')->implode(', ').'.']);
        }
    }

    /**
     * @param array<int, array<string, mixed>> $lines
     * @return array<int, array<string, mixed>>
     */
    private function normalizeLines(array $lines): array
    {
        $max = (int) config('marketing.purchase_requisition.max_lines', 50);
        if (count($lines) < 1 || count($lines) > $max) {
            throw ValidationException::withMessages(['lines' => 'Isi 1 sampai '.$max.' baris barang.']);
        }

        $rows = [];
        foreach (array_values($lines) as $i => $line) {
            $part = trim((string) ($line['part_num'] ?? ''));
            $qty = round((float) ($line['qty'] ?? 0), 2);
            $price = isset($line['unit_price']) && $line['unit_price'] !== '' ? round((float) $line['unit_price'], 2) : null;
            $desc = isset($line['description']) ? (trim((string) $line['description']) ?: null) : null;
            $key = mb_strtolower($part);

            if ($part === '') {
                throw ValidationException::withMessages(['lines' => 'Kode part baris '.($i + 1).' wajib diisi.']);
            }
            if (isset($rows[$key])) {
                throw ValidationException::withMessages(['lines' => 'Kode part '.$part.' diisi lebih dari sekali.']);
            }
            if ($qty <= 0) {
                throw ValidationException::withMessages(['lines' => 'Jumlah barang '.$part.' harus lebih dari 0.']);
            }
            if ($price !== null && $price < 0) {
                throw ValidationException::withMessages(['lines' => 'Harga satuan '.$part.' tidak boleh negatif.']);
            }

            // Keputusan sistem "Part registered?": part yang tidak ada di Part Master menunggu IT, dan keterangan wajib agar IT bisa mendaftarkannya.
            $registered = $this->partExists($part);
            if (! $registered && $desc === null) {
                throw ValidationException::withMessages(['lines' => 'Kode part '.$part.' belum terdaftar. Isi keterangan barang agar IT dapat mendaftarkannya.']);
            }

            $rows[$key] = [
                'line_no' => $i + 1, 'part_num' => $part, 'requested_part_num' => $registered ? null : $part, 'description' => $desc, 'qty' => $qty,
                'unit_price' => $price, 'is_asset' => (bool) ($line['is_asset'] ?? false), 'part_registered' => $registered,
            ];
        }

        return array_values($rows);
    }

    private function replaceLines(PurchaseRequisition $pr, array $rows): void
    {
        PurchaseRequisitionLine::where('purchase_requisition_id', $pr->id)->delete();
        foreach ($rows as $row) {
            PurchaseRequisitionLine::create($row + ['purchase_requisition_id' => $pr->id]);
        }
    }

    /** Total nilai PR dan keputusan sistem "Barang Asset atau lebih dari 30 juta?" (ambang diatur di konfigurasi). */
    private function refreshDecisionFields(PurchaseRequisition $pr): void
    {
        $lines = PurchaseRequisitionLine::where('purchase_requisition_id', $pr->id)->get();
        $total = round((float) $lines->sum(fn ($l) => (float) $l->qty * (float) ($l->unit_price ?? 0)), 2);
        $pr->update(['total_amount' => $total, 'requires_director' => $this->requiresDirector($lines->contains('is_asset', true), $total)]);
    }

    /** Barang asset, atau total lebih dari ambang (tepat sebesar ambang belum perlu Direktur). */
    public function requiresDirector(bool $anyAsset, float $total): bool
    {
        return $anyAsset || $total > (float) config('marketing.purchase_requisition.asset_threshold', 30000000);
    }

    private function nextNumber(): string
    {
        $prefix = 'PR-'.now()->format('Y').'-';
        $last = PurchaseRequisition::where('pr_no', 'like', $prefix.'%')->lockForUpdate()->orderByDesc('pr_no')->value('pr_no');

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

    private function codes(string $type): array
    {
        return collect(config("marketing.approval_reason_codes.{$type}"))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all();
    }

    private function options(string $key): array
    {
        return collect(config("marketing.purchase_requisition.{$key}"))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all();
    }

    private function audit(User $user, string $step, PurchaseRequisition $pr, ?array $old, array $new): void
    {
        $this->auditLogService->log($user->id, 'purchase_requisition.'.$step, PurchaseRequisition::class, $pr->id, $old, $new);
    }
}