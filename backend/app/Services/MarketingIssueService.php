<?php
namespace App\Services;

use App\Models\MarketingIssue;
use App\Models\MarketingIssueItem;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.17 (MKT17 Issue Miscellaneous Material). Permintaan User (langkah 01) disampaikan di luar sistem dan tidak dicatat.
 * 02 Marketing mengeluarkan barang dengan Issue Misc. Material (di sini dicatat nomor dokumennya dan barangnya), 03 Marketing mengisi nama
 * sales atau customer beserta peruntukannya pada Remarks. Langkah di Epicor dikerjakan di luar aplikasi; di sini dicatat.
 */
class MarketingIssueService
{
    private const WITH = ['creator:id,name', 'items'];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function hasAccess(User $user): bool
    {
        return in_array($user->role, (array) config('marketing.issue_material.roles', []), true);
    }

    public function list(User $user, ?string $q = null): Collection
    {
        $q = trim((string) $q);
        $rows = MarketingIssue::query()->withCount('items')->with('creator:id,name')
            ->when($q !== '', fn ($x) => $x->where(fn ($w) => $w->where('issue_no', 'like', "%{$q}%")->orWhere('issue_reference', 'like', "%{$q}%")
                ->orWhere('recipient_name', 'like', "%{$q}%")->orWhere('requester_name', 'like', "%{$q}%")))
            ->orderByDesc('id')->get();

        return $rows->each(function (MarketingIssue $i) {
            $i->setAttribute('awaiting_label', $this->awaitingLabel($i));
            $i->setAttribute('can_act', $i->status === 'ISSUED');
        });
    }

    public function find(int $id): ?MarketingIssue
    {
        $i = MarketingIssue::query()->with(self::WITH)->find($id);
        if (! $i) {
            return null;
        }
        $i->setAttribute('awaiting_label', $this->awaitingLabel($i));
        $i->setAttribute('flags', ['can_edit' => $i->status === 'ISSUED', 'can_complete' => $i->status === 'ISSUED']);
        $i->setAttribute('recipient_types', collect(config('marketing.issue_material.recipient_types'))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all());

        return $i;
    }

    private function awaitingLabel(MarketingIssue $i): ?string
    {
        return $i->status === 'ISSUED' ? 'Marketing (input nama sales atau customer dan peruntukannya)' : null;
    }

    /** @param array{issue_reference: string, requester_name?: ?string, notes?: ?string, items: array<int, array<string, mixed>>} $data */
    public function create(User $user, array $data): MarketingIssue
    {
        return DB::transaction(function () use ($user, $data) {
            $items = $this->normalizeItems($data['items']);
            $issue = MarketingIssue::create([
                'issue_no' => $this->nextNumber(), 'issue_reference' => trim($data['issue_reference']), 'requester_name' => $this->clean($data['requester_name'] ?? null),
                'notes' => $data['notes'] ?? null, 'status' => 'ISSUED', 'created_by' => $user->id,
            ]);
            $this->replaceItems($issue, $items);
            $this->audit($user, 'create', $issue, null, ['issue_no' => $issue->issue_no, 'issue_reference' => $issue->issue_reference, 'items' => count($items)]);

            return $this->find($issue->id);
        });
    }

    /** Nomor dokumen, barang, dan keterangan bisa diperbaiki selama Remarks belum diisi. */
    public function update(MarketingIssue $issue, User $user, array $data): MarketingIssue
    {
        return DB::transaction(function () use ($issue, $user, $data) {
            $fresh = MarketingIssue::whereKey($issue->id)->lockForUpdate()->firstOrFail();
            if ($fresh->status !== 'ISSUED') {
                throw ValidationException::withMessages(['status' => 'Issue hanya bisa diubah sebelum Remarks diisi.']);
            }

            $items = $this->normalizeItems($data['items']);
            $fresh->update([
                'issue_reference' => trim($data['issue_reference']), 'requester_name' => $this->clean($data['requester_name'] ?? null), 'notes' => $data['notes'] ?? null,
            ]);
            $this->replaceItems($fresh, $items);
            $this->audit($user, 'update', $fresh, null, ['issue_reference' => $fresh->issue_reference, 'items' => count($items)]);

            return $this->find($fresh->id);
        });
    }

    /** Langkah 03: nama sales atau customer beserta peruntukannya pada Remarks. */
    public function complete(MarketingIssue $issue, User $user, string $type, string $name, string $purpose): MarketingIssue
    {
        return DB::transaction(function () use ($issue, $user, $type, $name, $purpose) {
            $fresh = MarketingIssue::whereKey($issue->id)->lockForUpdate()->firstOrFail();
            if ($fresh->status !== 'ISSUED') {
                throw ValidationException::withMessages(['status' => 'Remarks sudah diisi.']);
            }
            if (! array_key_exists($type, (array) config('marketing.issue_material.recipient_types'))) {
                throw ValidationException::withMessages(['recipient_type' => 'Pilih Sales atau Customer.']);
            }

            $name = trim($name);
            $purpose = trim($purpose);
            $label = config('marketing.issue_material.recipient_types.'.$type);
            $fresh->update([
                'recipient_type' => $type, 'recipient_name' => $name, 'purpose' => $purpose,
                'remarks' => mb_substr($name.' ('.$label.') / '.$purpose, 0, 255), 'status' => 'DONE', 'completed_by' => $user->id, 'completed_at' => now(),
            ]);
            $this->audit($user, 'complete', $fresh, ['status' => 'ISSUED'], ['status' => 'DONE', 'remarks' => $fresh->remarks]);

            return $this->find($fresh->id);
        });
    }

    private function clean(?string $v): ?string
    {
        $v = $v === null ? null : trim($v);

        return $v === '' ? null : $v;
    }

    /** @return array<int, array<string, mixed>> */
    private function normalizeItems(array $items): array
    {
        $max = (int) config('marketing.issue_material.max_items', 20);
        if (count($items) < 1 || count($items) > $max) {
            throw ValidationException::withMessages(['items' => 'Isi 1 sampai '.$max.' barang.']);
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
            $rows[$key] = ['part_num' => $part, 'qty' => $qty, 'description' => isset($i['description']) ? $this->clean($i['description']) : null];
        }

        return array_values($rows);
    }

    private function replaceItems(MarketingIssue $issue, array $rows): void
    {
        MarketingIssueItem::where('marketing_issue_id', $issue->id)->delete();
        foreach ($rows as $row) {
            MarketingIssueItem::create($row + ['marketing_issue_id' => $issue->id]);
        }
    }

    private function nextNumber(): string
    {
        $prefix = 'IS-'.now()->format('Y').'-';
        $last = MarketingIssue::where('issue_no', 'like', $prefix.'%')->lockForUpdate()->orderByDesc('issue_no')->value('issue_no');

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

    private function audit(User $user, string $step, MarketingIssue $issue, ?array $old, array $new): void
    {
        $this->auditLogService->log($user->id, 'marketing_issue.'.$step, MarketingIssue::class, $issue->id, $old, $new);
    }
}