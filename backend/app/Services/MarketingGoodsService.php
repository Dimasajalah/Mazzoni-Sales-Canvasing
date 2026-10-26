<?php
namespace App\Services;

use App\Models\MarketingClaim;
use App\Models\MarketingClaimAttachment;
use App\Models\MarketingClaimGoods;
use App\Models\MarketingClaimGoodsItem;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.13 (MKT13 Metode Pencairan Program, Barang/Reward). Urutan: 01 Marketing mengatur jenis dan jumlah barang (Reward),
 * 02 Check Stock di warehouse Marketing, bila tidak tersedia 03 Requisition (PR01) dan barang siap setelah di-receipt, 04 Misc. Shipment
 * dengan Reason Code, 05 Issue Misc. Material, 06 Code Klaim dan nama penerima pada Reference dengan bukti serah terima terlampir, lalu
 * klaim menjadi Dicairkan. Seluruh langkah di Epicor dikerjakan di luar aplikasi; di sini dicatat.
 */
class MarketingGoodsService
{
    private const WITH = ['customer:id,customer_code,name,city', 'program.budget:id,campaign_code,name'];

    private const ACTORS = ['set_by', 'stock_checked_by', 'requisition_by', 'received_by', 'shipped_by', 'issued_by', 'handed_over_by'];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /** Klaim yang masih dikerjakan: Disetujui dengan metode Barang. Yang sudah Dicairkan tidak termasuk. */
    private function open()
    {
        return MarketingClaim::query()->where('status', 'APPROVED')->where('payout_method', 'BARANG');
    }

    /** Untuk melihat hasil: klaim Barang yang Disetujui maupun yang sudah Dicairkan. */
    private function viewable()
    {
        return MarketingClaim::query()->whereIn('status', ['APPROVED', 'DISBURSED'])->where('payout_method', 'BARANG');
    }

    public function available(?string $q = null): Collection
    {
        $q = trim((string) $q);
        $claims = $this->open()->with(self::WITH)
            ->when($q !== '', fn ($x) => $x->where(fn ($w) => $w->where('claim_no', 'like', "%{$q}%")
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$q}%")->orWhere('customer_code', 'like', "%{$q}%"))))
            ->orderBy('id')->get();

        $goods = MarketingClaimGoods::withCount('items')->whereIn('marketing_claim_id', $claims->pluck('id'))->get()->keyBy('marketing_claim_id');

        return $claims->each(function (MarketingClaim $c) use ($goods) {
            $c->setAttribute('goods_status', $goods[$c->id]->status ?? null);
            $c->setAttribute('items_count', (int) ($goods[$c->id]->items_count ?? 0));
        });
    }

    public function find(int $id): ?MarketingClaim
    {
        $claim = $this->viewable()->with(self::WITH)->find($id);

        return $claim ? $this->decorate($claim) : null;
    }

    private function decorate(MarketingClaim $claim): MarketingClaim
    {
        $goods = MarketingClaimGoods::with('items')->where('marketing_claim_id', $claim->id)->first();
        $open = $claim->status === 'APPROVED';
        $status = $goods?->status;

        if ($goods) {
            $ids = array_filter(array_map(fn ($f) => $goods->{$f}, self::ACTORS));
            $names = $ids ? User::whereIn('id', $ids)->pluck('name', 'id') : collect();
            $goods->setAttribute('actors', collect(self::ACTORS)->mapWithKeys(fn ($f) => [$f => $goods->{$f} ? ($names[$goods->{$f}] ?? null) : null])->all());
        }

        $claim->setRelation('goods', $goods);
        $claim->setAttribute('goods_status', $status);
        $claim->setAttribute('flags', [
            'can_items' => $open && ($goods === null || $status === 'SET'),
            'can_stock' => $open && $status === 'SET',
            'can_requisition' => $open && $status === 'REQUISITION',
            'can_receive' => $open && $status === 'REQUISITION' && filled($goods->requisition_number),
            'can_shipment' => $open && $status === 'READY',
            'can_issue' => $open && $status === 'SHIPPED',
            'can_handover' => $open && $status === 'ISSUED',
            'max_items' => (int) config('marketing.claim_goods.max_items', 20),
        ]);

        return $claim;
    }

    // ------------------------------------------------------------- langkah

    /**
     * Langkah 01: jenis barang dan jumlahnya (Reward). Kode part harus ada di Part Master. Boleh diubah selama Check Stock belum dilakukan.
     *
     * @param array<int, array{part_num: string, qty: float|int|string, description?: ?string}> $items
     */
    public function setItems(MarketingClaim $claim, array $items, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $items, $user) {
            $fresh = $this->lockClaim($claim);
            $goods = MarketingClaimGoods::where('marketing_claim_id', $fresh->id)->lockForUpdate()->first();
            if ($goods && $goods->status !== 'SET') {
                throw ValidationException::withMessages(['status' => 'Reward tidak bisa diubah setelah Check Stock dilakukan.']);
            }

            $max = (int) config('marketing.claim_goods.max_items', 20);
            if (count($items) < 1 || count($items) > $max) {
                throw ValidationException::withMessages(['items' => 'Isi 1 sampai '.$max.' jenis barang.']);
            }

            $rows = [];
            foreach ($items as $i) {
                $part = trim((string) $i['part_num']);
                $qty = round((float) $i['qty'], 2);
                if (isset($rows[mb_strtolower($part)])) {
                    throw ValidationException::withMessages(['items' => 'Kode part '.$part.' diisi lebih dari sekali.']);
                }
                if ($qty <= 0) {
                    throw ValidationException::withMessages(['items' => 'Jumlah barang '.$part.' harus lebih dari 0.']);
                }
                if (! $this->partExists($part)) {
                    throw ValidationException::withMessages(['items' => 'Kode part '.$part.' tidak ada di Part Master.']);
                }
                $rows[mb_strtolower($part)] = ['part_num' => $part, 'qty' => $qty, 'description' => isset($i['description']) ? trim((string) $i['description']) ?: null : null];
            }

            $goods = $goods ?: MarketingClaimGoods::create(['marketing_claim_id' => $fresh->id, 'status' => 'SET']);
            $goods->update(['set_by' => $user->id, 'set_at' => now()]);
            MarketingClaimGoodsItem::where('marketing_claim_goods_id', $goods->id)->delete();
            foreach ($rows as $row) {
                MarketingClaimGoodsItem::create($row + ['marketing_claim_goods_id' => $goods->id]);
            }

            $this->audit($user, 'goods_items', $fresh, null, ['items' => array_values(array_map(fn ($r) => $r['part_num'].' x '.$r['qty'], $rows))]);

            return $this->find($fresh->id);
        });
    }

    /** Langkah 02: Check Stock di warehouse Marketing. Tersedia: barang siap. Tidak tersedia: perlu Requisition (langkah 03). */
    public function checkStock(MarketingClaim $claim, bool $available, ?string $notes, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $available, $notes, $user) {
            $goods = $this->goodsIn($this->lockClaim($claim), ['SET'], 'Atur jenis dan jumlah barang (Reward) dulu, dan Check Stock hanya dilakukan sekali.');

            $goods->update([
                'stock_available' => $available, 'stock_notes' => $notes, 'stock_checked_by' => $user->id, 'stock_checked_at' => now(),
                'status' => $available ? 'READY' : 'REQUISITION',
            ]);
            $this->audit($user, 'goods_stock', $claim, ['status' => 'SET'], ['status' => $goods->status, 'available' => $available]);

            return $this->find($claim->id);
        });
    }

    /** Langkah 03 (Purchase): nomor Requisition pada PR01. */
    public function saveRequisition(MarketingClaim $claim, string $number, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $number, $user) {
            $goods = $this->goodsIn($this->lockClaim($claim), ['REQUISITION'], 'Requisition hanya untuk barang yang stoknya tidak tersedia.');

            $goods->update(['requisition_number' => trim($number), 'requisition_by' => $user->id, 'requisition_at' => now()]);
            $this->audit($user, 'goods_requisition', $claim, null, ['requisition' => trim($number)]);

            return $this->find($claim->id);
        });
    }

    /** Langkah 03: barang dianggap siap setelah di-receipt. */
    public function confirmReceipt(MarketingClaim $claim, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $user) {
            $goods = $this->goodsIn($this->lockClaim($claim), ['REQUISITION'], 'Barang hanya di-receipt setelah Requisition diajukan.');
            if (blank($goods->requisition_number)) {
                throw ValidationException::withMessages(['requisition_number' => 'Isi nomor Requisition dulu sebelum menandai barang di-receipt.']);
            }

            $goods->update(['status' => 'READY', 'received_by' => $user->id, 'received_at' => now()]);
            $this->audit($user, 'goods_receipt', $claim, ['status' => 'REQUISITION'], ['status' => 'READY']);

            return $this->find($claim->id);
        });
    }

    /** Langkah 04: Misc. Shipment dengan Reason Code. */
    public function recordShipment(MarketingClaim $claim, string $reasonCode, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $reasonCode, $user) {
            $goods = $this->goodsIn($this->lockClaim($claim), ['READY'], 'Misc. Shipment hanya dicatat setelah barang siap (stok tersedia atau sudah di-receipt).');

            $goods->update(['shipment_reason_code' => trim($reasonCode), 'shipped_by' => $user->id, 'shipped_at' => now(), 'status' => 'SHIPPED']);
            $this->audit($user, 'goods_shipment', $claim, ['status' => 'READY'], ['status' => 'SHIPPED', 'reason_code' => trim($reasonCode)]);

            return $this->find($claim->id);
        });
    }

    /** Langkah 05: Issue Misc. Material mengeluarkan barang dari stok. */
    public function recordIssue(MarketingClaim $claim, string $reference, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $reference, $user) {
            $goods = $this->goodsIn($this->lockClaim($claim), ['SHIPPED'], 'Issue Misc. Material hanya dicatat setelah Misc. Shipment.');

            $goods->update(['issue_reference' => trim($reference), 'issued_by' => $user->id, 'issued_at' => now(), 'status' => 'ISSUED']);
            $this->audit($user, 'goods_issue', $claim, ['status' => 'SHIPPED'], ['status' => 'ISSUED', 'issue_reference' => trim($reference)]);

            return $this->find($claim->id);
        });
    }

    /**
     * Langkah 06: Code Klaim dan nama penerima pada Reference; bukti serah terima (dicetak) dilampirkan pada klaim; klaim menjadi Dicairkan.
     *
     * @param array<int, UploadedFile> $files
     */
    public function handOver(MarketingClaim $claim, string $recipient, array $files, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $recipient, $files, $user) {
            $fresh = $this->lockClaim($claim);
            $goods = $this->goodsIn($fresh, ['ISSUED'], 'Serah terima hanya dicatat setelah barang dikeluarkan (Issue Misc. Material).');
            if (count($files) < 1) {
                throw ValidationException::withMessages(['files' => 'Lampirkan bukti serah terima barang (foto atau PDF).']);
            }

            $recipient = trim($recipient);
            foreach ($files as $file) {
                MarketingClaimAttachment::create([
                    'marketing_claim_id' => $fresh->id, 'kind' => 'HANDOVER',
                    'path' => $file->store('marketing-claims/'.$fresh->id, 'public'),
                    'filename' => $file->getClientOriginalName(), 'mime' => $file->getClientMimeType(), 'size' => $file->getSize() ?: 0,
                ]);
            }

            $goods->update([
                'recipient_name' => $recipient, 'reference' => $fresh->claim_no.' / '.$recipient,
                'handed_over_by' => $user->id, 'handed_over_at' => now(), 'status' => 'HANDED_OVER',
            ]);
            $fresh->update(['status' => 'DISBURSED']);
            $this->audit($user, 'goods_handover', $fresh, ['status' => 'APPROVED'], ['status' => 'DISBURSED', 'recipient' => $recipient, 'files' => count($files)]);

            return $this->find($fresh->id);
        });
    }

    // ------------------------------------------------------------- pembantu

    private function lockClaim(MarketingClaim $claim): MarketingClaim
    {
        $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
        if ($fresh->status !== 'APPROVED' || $fresh->payout_method !== 'BARANG') {
            throw ValidationException::withMessages(['claim' => 'Klaim ini tidak berstatus Disetujui dengan metode pencairan Barang.']);
        }

        return $fresh;
    }

    /** @param array<int, string> $statuses */
    private function goodsIn(MarketingClaim $claim, array $statuses, string $message): MarketingClaimGoods
    {
        $goods = MarketingClaimGoods::where('marketing_claim_id', $claim->id)->lockForUpdate()->first();
        if (! $goods || ! in_array($goods->status, $statuses, true)) {
            throw ValidationException::withMessages(['status' => $message]);
        }

        return $goods;
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

    private function audit(User $user, string $step, MarketingClaim $claim, ?array $old, array $new): void
    {
        $this->auditLogService->log($user->id, 'marketing_claim.'.$step, MarketingClaim::class, $claim->id, $old, $new);
    }
}