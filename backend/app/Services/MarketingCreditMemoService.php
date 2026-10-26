<?php
namespace App\Services;

use App\Models\MarketingClaim;
use App\Models\MarketingClaimCreditMemo;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.11 (MKT11 Metode Pencairan Program, Potong Tagihan). Finance membuat credit memo atas invoice lama distributor
 * yang masih terbuka, senilai klaim yang disetujui dan dengan kode klaim di Reference (01-02, ditambah jenis PPh bila dikenakan),
 * lalu Check & Post (03) dan Apply (04). Saldo klaim baru berkurang saat Apply. Satu klaim hanya punya satu credit memo.
 */
class MarketingCreditMemoService
{
    private const WITH = ['customer:id,customer_code,name,city', 'program.budget:id,campaign_code,name'];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    private function scoped()
    {
        return MarketingClaim::query()->where('status', 'APPROVED')->where('payout_method', 'POTONG_TAGIHAN');
    }

    /** Klaim Potong Tagihan yang credit memo-nya belum di-Apply (opsional dicari berdasarkan distributor atau kode klaim). */
    public function available(?string $q = null): Collection
    {
        $q = trim((string) $q);
        $claims = $this->scoped()->with(self::WITH)
            ->when($q !== '', fn ($x) => $x->where(fn ($w) => $w->where('claim_no', 'like', "%{$q}%")
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$q}%")->orWhere('customer_code', 'like', "%{$q}%"))))
            ->orderBy('id')->get();

        $status = MarketingClaimCreditMemo::whereIn('marketing_claim_id', $claims->pluck('id'))->pluck('status', 'marketing_claim_id');

        return $claims->each(function (MarketingClaim $c) use ($status) {
            $c->setAttribute('credit_memo_status', $status[$c->id] ?? null);
            $c->setAttribute('balance', ($status[$c->id] ?? null) === 'APPLIED' ? 0.0 : round((float) $c->approved_amount, 2));
        })->filter(fn (MarketingClaim $c) => $c->credit_memo_status !== 'APPLIED')->values();
    }

    public function find(int $id): ?MarketingClaim
    {
        $claim = $this->scoped()->with(self::WITH)->find($id);

        return $claim ? $this->decorate($claim) : null;
    }

    /** Menempelkan credit memo, saldo klaim, dan langkah yang boleh dilakukan pada klaim. */
    private function decorate(MarketingClaim $claim): MarketingClaim
    {
        $memo = MarketingClaimCreditMemo::with(['enterer:id,name', 'poster:id,name', 'applier:id,name'])->where('marketing_claim_id', $claim->id)->first();
        $status = $memo?->status;

        $claim->setRelation('credit_memo', $memo);
        $claim->setAttribute('credit_memo_status', $status);
        // Saldo klaim baru berkurang saat Apply Credit Memo.
        $claim->setAttribute('balance', $status === 'APPLIED' ? 0.0 : round((float) $claim->approved_amount, 2));
        $claim->setAttribute('flags', [
            'can_entry' => $status === null || $status === 'ENTERED',
            'can_post' => $status === 'ENTERED',
            'can_apply' => $status === 'POSTED',
            'tax_types' => collect(config('marketing.credit_memo.tax_types'))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all(),
        ]);

        return $claim;
    }

    /**
     * Langkah 01-02: Credit Memo Entry. Nilai credit selalu sebesar klaim yang disetujui dan Reference selalu kode klaim (tidak diketik).
     * Boleh diubah selama belum di-Post.
     *
     * @param array{invoice_number: string, tax_applies?: bool|null, tax_type?: ?string} $data
     */
    public function saveEntry(MarketingClaim $claim, array $data, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $data, $user) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            $this->assertEligible($fresh);

            $memo = MarketingClaimCreditMemo::where('marketing_claim_id', $fresh->id)->lockForUpdate()->first();
            if ($memo && $memo->status !== 'ENTERED') {
                throw ValidationException::withMessages(['status' => 'Credit memo sudah di-Post, entry tidak bisa diubah lagi.']);
            }

            $taxApplies = (bool) ($data['tax_applies'] ?? false);
            $taxType = $data['tax_type'] ?? null;
            if ($taxApplies && ! array_key_exists((string) $taxType, (array) config('marketing.credit_memo.tax_types'))) {
                throw ValidationException::withMessages(['tax_type' => 'Pilih Tax Type (PPh Badan atau PPh Pribadi) sesuai status distributor.']);
            }

            $fields = [
                'invoice_number' => trim($data['invoice_number']),
                'credit_value' => round((float) $fresh->approved_amount, 2),
                'reference' => $fresh->claim_no,
                'tax_applies' => $taxApplies,
                'tax_type' => $taxApplies ? $taxType : null,
            ];

            if ($memo) {
                $memo->update($fields);
            } else {
                $memo = MarketingClaimCreditMemo::create($fields + [
                    'marketing_claim_id' => $fresh->id, 'status' => 'ENTERED', 'entered_by' => $user->id, 'entered_at' => now(),
                ]);
            }

            $this->auditLogService->log($user->id, 'marketing_claim.credit_memo_entry', MarketingClaim::class, $fresh->id, null, [
                'invoice' => $memo->invoice_number, 'credit_value' => $memo->credit_value, 'tax_type' => $memo->tax_type,
            ]);

            return $this->find($fresh->id);
        });
    }

    /** Langkah 03: Check & Post Credit Memo. Nomor AR Credit Memo diisi di sini dan harus unik. */
    public function post(MarketingClaim $claim, string $creditMemoNumber, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $creditMemoNumber, $user) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            $this->assertEligible($fresh);

            $memo = MarketingClaimCreditMemo::where('marketing_claim_id', $fresh->id)->lockForUpdate()->first();
            if (! $memo || $memo->status !== 'ENTERED') {
                throw ValidationException::withMessages(['status' => $memo ? 'Credit memo ini sudah di-Post.' : 'Isi Credit Memo Entry dulu sebelum Check & Post.']);
            }

            $number = trim($creditMemoNumber);
            if (MarketingClaimCreditMemo::where('credit_memo_number', $number)->where('id', '!=', $memo->id)->exists()) {
                throw ValidationException::withMessages(['credit_memo_number' => 'Nomor credit memo '.$number.' sudah dipakai klaim lain.']);
            }

            $memo->update(['credit_memo_number' => $number, 'status' => 'POSTED', 'posted_by' => $user->id, 'posted_at' => now()]);
            $this->auditLogService->log($user->id, 'marketing_claim.credit_memo_post', MarketingClaim::class, $fresh->id, ['status' => 'ENTERED'], ['status' => 'POSTED', 'credit_memo_number' => $number]);

            return $this->find($fresh->id);
        });
    }

    /** Langkah 04: Apply Credit Memo. Saldo piutang distributor dan sisa saldo klaim berkurang. */
    public function apply(MarketingClaim $claim, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $user) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            $this->assertEligible($fresh);

            $memo = MarketingClaimCreditMemo::where('marketing_claim_id', $fresh->id)->lockForUpdate()->first();
            if (! $memo || $memo->status !== 'POSTED') {
                throw ValidationException::withMessages(['status' => $memo && $memo->status === 'APPLIED'
                    ? 'Credit memo ini sudah di-Apply.'
                    : 'Credit memo harus di-Post dulu sebelum di-Apply.']);
            }

            $memo->update(['status' => 'APPLIED', 'applied_by' => $user->id, 'applied_at' => now()]);
            $this->auditLogService->log($user->id, 'marketing_claim.credit_memo_apply', MarketingClaim::class, $fresh->id, ['status' => 'POSTED'], ['status' => 'APPLIED', 'credit_value' => $memo->credit_value]);

            return $this->find($fresh->id);
        });
    }

    private function assertEligible(MarketingClaim $claim): void
    {
        if ($claim->status !== 'APPROVED' || $claim->payout_method !== 'POTONG_TAGIHAN') {
            throw ValidationException::withMessages(['claim' => 'Klaim ini tidak berstatus Disetujui dengan metode pencairan Potong Tagihan.']);
        }
    }
}