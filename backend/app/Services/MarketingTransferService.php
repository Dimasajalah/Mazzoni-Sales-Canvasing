<?php
namespace App\Services;

use App\Models\MarketingClaim;
use App\Models\MarketingClaimTransfer;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.12 (MKT12 Metode Pencairan Program, Transfer). Finance mengisi rekening tujuan dan status PKP distributor
 * (Misc. Payment Entry). Rekening perorangan memakai PPh 21 (2,5 persen, dasar NPWP atau KTP penerima); selain itu PPh 23
 * (2 persen untuk PKP, 4 persen untuk Non-PKP). Setelah dana ditransfer, nomor referensi diisi dan status klaim menjadi Dicairkan.
 * Dasar pajak yang dipakai: Nilai Klaim Disetujui.
 */
class MarketingTransferService
{
    private const WITH = ['customer:id,customer_code,name,city', 'program.budget:id,campaign_code,name'];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /** Klaim yang masih perlu dikerjakan: Disetujui dengan metode Transfer. Yang sudah Dicairkan tidak termasuk. */
    private function open()
    {
        return MarketingClaim::query()->where('status', 'APPROVED')->where('payout_method', 'TRANSFER');
    }

    /** Untuk melihat hasil: klaim Transfer yang Disetujui maupun yang sudah Dicairkan. */
    private function viewable()
    {
        return MarketingClaim::query()->whereIn('status', ['APPROVED', 'DISBURSED'])->where('payout_method', 'TRANSFER');
    }

    /** Tarif dan jumlah pajak dari nilai klaim. Perorangan: PPh 21. Selain itu: PPh 23 (PKP lebih rendah dari Non-PKP). */
    public function computeTax(float $gross, bool $individual, bool $pkp): array
    {
        if ($individual) {
            $type = 'PPH_21';
            $rate = (float) config('marketing.transfer.pph21_rate', 2.5);
        } else {
            $type = 'PPH_23';
            $rate = (float) config($pkp ? 'marketing.transfer.pph23_pkp_rate' : 'marketing.transfer.pph23_non_pkp_rate', $pkp ? 2 : 4);
        }
        $tax = round($gross * $rate / 100, 2);

        return ['tax_type' => $type, 'tax_rate' => $rate, 'tax_amount' => $tax, 'net_amount' => round($gross - $tax, 2)];
    }

    public function available(?string $q = null): Collection
    {
        $q = trim((string) $q);
        $claims = $this->open()->with(self::WITH)
            ->when($q !== '', fn ($x) => $x->where(fn ($w) => $w->where('claim_no', 'like', "%{$q}%")
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$q}%")->orWhere('customer_code', 'like', "%{$q}%"))))
            ->orderBy('id')->get();

        $status = MarketingClaimTransfer::whereIn('marketing_claim_id', $claims->pluck('id'))->pluck('status', 'marketing_claim_id');

        return $claims->each(fn (MarketingClaim $c) => $c->setAttribute('transfer_status', $status[$c->id] ?? null));
    }

    public function find(int $id): ?MarketingClaim
    {
        $claim = $this->viewable()->with(self::WITH)->find($id);

        return $claim ? $this->decorate($claim) : null;
    }

    private function decorate(MarketingClaim $claim): MarketingClaim
    {
        $transfer = MarketingClaimTransfer::with(['enterer:id,name', 'transferer:id,name'])->where('marketing_claim_id', $claim->id)->first();
        $open = $claim->status === 'APPROVED';

        $claim->setRelation('transfer', $transfer);
        $claim->setAttribute('transfer_status', $transfer?->status);
        $claim->setAttribute('flags', [
            'can_entry' => $open && ($transfer === null || $transfer->status === 'ENTERED'),
            'can_transfer' => $open && $transfer?->status === 'ENTERED',
            'rates' => [
                'pph21' => (float) config('marketing.transfer.pph21_rate'),
                'pph23_pkp' => (float) config('marketing.transfer.pph23_pkp_rate'),
                'pph23_non_pkp' => (float) config('marketing.transfer.pph23_non_pkp_rate'),
            ],
            'tax_id_types' => collect(config('marketing.transfer.tax_id_types'))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all(),
        ]);

        return $claim;
    }

    /**
     * Langkah 01-03: Misc. Payment Entry. Pajak dan nilai transfer dihitung sistem dari Nilai Klaim Disetujui (tidak diketik).
     * Boleh diubah selama dana belum dinyatakan ditransfer.
     *
     * @param array{bank_name: string, account_number: string, account_name: string, is_individual: bool, is_pkp?: bool|null, tax_id_type?: ?string, tax_id_number?: ?string} $data
     */
    public function saveEntry(MarketingClaim $claim, array $data, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $data, $user) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            $this->assertOpen($fresh);

            $transfer = MarketingClaimTransfer::where('marketing_claim_id', $fresh->id)->lockForUpdate()->first();
            if ($transfer && $transfer->status !== 'ENTERED') {
                throw ValidationException::withMessages(['status' => 'Dana sudah ditransfer, entry tidak bisa diubah lagi.']);
            }

            $individual = (bool) $data['is_individual'];
            $pkp = (bool) ($data['is_pkp'] ?? false);
            $idType = $data['tax_id_type'] ?? null;
            $idNumber = isset($data['tax_id_number']) ? trim($data['tax_id_number']) : null;

            if ($individual) {
                if (! array_key_exists((string) $idType, (array) config('marketing.transfer.tax_id_types'))) {
                    throw ValidationException::withMessages(['tax_id_type' => 'Pilih dasar PPh 21: NPWP atau KTP penerima.']);
                }
                if (blank($idNumber)) {
                    throw ValidationException::withMessages(['tax_id_number' => 'Isi nomor '.$idType.' penerima.']);
                }
            }

            $gross = round((float) $fresh->approved_amount, 2);
            $fields = [
                'bank_name' => trim($data['bank_name']),
                'account_number' => trim($data['account_number']),
                'account_name' => trim($data['account_name']),
                'is_individual' => $individual,
                'is_pkp' => $pkp,
                'tax_id_type' => $individual ? $idType : null,
                'tax_id_number' => $individual ? $idNumber : null,
                'gross_amount' => $gross,
            ] + $this->computeTax($gross, $individual, $pkp);

            if ($transfer) {
                $transfer->update($fields);
            } else {
                $transfer = MarketingClaimTransfer::create($fields + ['marketing_claim_id' => $fresh->id, 'status' => 'ENTERED', 'entered_by' => $user->id, 'entered_at' => now()]);
            }

            $this->auditLogService->log($user->id, 'marketing_claim.transfer_entry', MarketingClaim::class, $fresh->id, null, [
                'tax_type' => $transfer->tax_type, 'tax_rate' => $transfer->tax_rate, 'tax_amount' => $transfer->tax_amount, 'net_amount' => $transfer->net_amount,
            ]);

            return $this->find($fresh->id);
        });
    }

    /** Setelah dana ditransfer: nomor referensi (harus unik) diisi dan klaim menjadi Dicairkan. */
    public function markTransferred(MarketingClaim $claim, string $reference, string $transferredOn, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $reference, $transferredOn, $user) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            $this->assertOpen($fresh);

            $transfer = MarketingClaimTransfer::where('marketing_claim_id', $fresh->id)->lockForUpdate()->first();
            if (! $transfer || $transfer->status !== 'ENTERED') {
                throw ValidationException::withMessages(['status' => $transfer ? 'Klaim ini sudah dicairkan.' : 'Isi Misc. Payment Entry dulu sebelum menandai dicairkan.']);
            }

            $reference = trim($reference);
            if (MarketingClaimTransfer::where('transfer_reference', $reference)->where('id', '!=', $transfer->id)->exists()) {
                throw ValidationException::withMessages(['transfer_reference' => 'Nomor referensi '.$reference.' sudah dipakai klaim lain.']);
            }

            $transfer->update(['status' => 'TRANSFERRED', 'transfer_reference' => $reference, 'transferred_on' => $transferredOn, 'transferred_by' => $user->id, 'transferred_at' => now()]);
            $fresh->update(['status' => 'DISBURSED']);

            $this->auditLogService->log($user->id, 'marketing_claim.transfer_done', MarketingClaim::class, $fresh->id, ['status' => 'APPROVED'], [
                'status' => 'DISBURSED', 'reference' => $reference, 'net_amount' => $transfer->net_amount,
            ]);

            return $this->find($fresh->id);
        });
    }

    private function assertOpen(MarketingClaim $claim): void
    {
        if ($claim->status !== 'APPROVED' || $claim->payout_method !== 'TRANSFER') {
            throw ValidationException::withMessages(['claim' => 'Klaim ini tidak berstatus Disetujui dengan metode pencairan Transfer.']);
        }
    }
}