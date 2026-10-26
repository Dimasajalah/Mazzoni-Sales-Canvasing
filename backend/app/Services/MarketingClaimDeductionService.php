<?php
namespace App\Services;

use App\Models\MarketingClaim;
use App\Models\MarketingClaimDeduction;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.10 (MKT10 Metode Pencairan Program, Potong Nota). Klaim yang sudah disetujui dengan metode Potong Nota dipotong
 * pada nota distributor: nilai klaim yang dipakai tidak boleh melebihi total invoice maupun saldo klaim; potongan dicatat sebagai
 * Misc Charge berkode KLAIM bernilai negatif dengan kode klaim di Reference; saldo klaim berkurang. Satu klaim bisa dipotong pada banyak nota.
 */
class MarketingClaimDeductionService
{
    private const WITH = ['customer:id,customer_code,name,city,salesperson_id', 'program.budget:id,campaign_code,name'];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /** Pengguna dengan role sales hanya melihat klaim milik distributor yang menjadi tanggung jawabnya; role lain melihat semuanya. */
    private function scoped(User $user)
    {
        return MarketingClaim::query()
            ->where('status', 'APPROVED')->where('payout_method', 'POTONG_NOTA')
            ->when($user->role === 'sales', fn ($q) => $q->whereHas('customer', fn ($c) => $c->where('salesperson_id', $user->id)));
    }

    public function used(MarketingClaim $claim): float
    {
        return (float) MarketingClaimDeduction::where('marketing_claim_id', $claim->id)->sum('claim_amount_used');
    }

    /** Saldo Klaim = Nilai Klaim Disetujui dikurangi seluruh potongan yang sudah diposting. */
    public function balance(MarketingClaim $claim): float
    {
        return round((float) $claim->approved_amount - $this->used($claim), 2);
    }

    /** "Check Pengajuan Klaim": klaim Potong Nota yang masih punya saldo (opsional dicari berdasarkan distributor atau kode klaim). */
    public function available(User $user, ?string $q = null): Collection
    {
        $q = trim((string) $q);
        $claims = $this->scoped($user)->with(self::WITH)
            ->when($q !== '', fn ($x) => $x->where(fn ($w) => $w->where('claim_no', 'like', "%{$q}%")
                ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$q}%")->orWhere('customer_code', 'like', "%{$q}%"))))
            ->orderBy('id')->get();

        $used = MarketingClaimDeduction::whereIn('marketing_claim_id', $claims->pluck('id'))
            ->groupBy('marketing_claim_id')->selectRaw('marketing_claim_id, SUM(claim_amount_used) as used')->pluck('used', 'marketing_claim_id');

        return $claims->each(function (MarketingClaim $c) use ($used) {
            $c->setAttribute('used_total', round((float) ($used[$c->id] ?? 0), 2));
            $c->setAttribute('balance', round((float) $c->approved_amount - (float) ($used[$c->id] ?? 0), 2));
        })->filter(fn (MarketingClaim $c) => $c->balance > 0)->values();
    }

    /** Klaim Potong Nota beserta saldo dan riwayat potongannya; null bila tidak ada atau di luar cakupan pengguna. */
    public function find(int $id, User $user): ?MarketingClaim
    {
        $claim = $this->scoped($user)->with(self::WITH)->find($id);
        if (! $claim) {
            return null;
        }

        $deductions = MarketingClaimDeduction::with('poster:id,name')->where('marketing_claim_id', $claim->id)->orderBy('id')->get();
        $used = round((float) $deductions->sum('claim_amount_used'), 2);
        $claim->setAttribute('used_total', $used);
        $claim->setAttribute('balance', round((float) $claim->approved_amount - $used, 2));
        $claim->setAttribute('deductions', $deductions);

        return $claim;
    }

    /**
     * Menentukan nilai klaim yang dipakai pada satu nota. Bila tidak diisi: yang terkecil antara saldo klaim dan total invoice.
     * Bila diisi: harus lebih dari 0 dan tidak melebihi total invoice maupun saldo klaim. "Dibatasi invoice" berarti saldo klaim
     * sama dengan atau lebih besar dari total invoice (nilai klaim yang dipakai harus disesuaikan agar tidak melebihi invoice).
     *
     * @return array{0: float, 1: bool} [nilai yang dipakai, dibatasi nilai invoice]
     */
    public function decideUsed(float $balance, float $invoiceTotal, ?float $requested): array
    {
        $used = round($requested ?? min($balance, $invoiceTotal), 2);

        if ($used <= 0) {
            throw ValidationException::withMessages(['used_amount' => 'Nilai klaim yang digunakan harus lebih dari 0.']);
        }
        if ($used - $invoiceTotal > 0.005) {
            throw ValidationException::withMessages(['used_amount' => 'Nilai klaim yang digunakan tidak boleh melebihi total invoice (Rp '.number_format($invoiceTotal, 0, ',', '.').').']);
        }
        if ($used - $balance > 0.005) {
            throw ValidationException::withMessages(['used_amount' => 'Nilai klaim yang digunakan melebihi saldo klaim (Rp '.number_format($balance, 0, ',', '.').').']);
        }

        return [$used, $balance >= $invoiceTotal];
    }

    /**
     * "Check & Post": memeriksa lalu memposting potongan klaim pada satu nota. Nilai yang dipakai (bila tidak diisi) adalah yang terkecil
     * antara saldo klaim dan total invoice; bila diisi, tidak boleh melebihi keduanya.
     *
     * @param array{invoice_number: string, invoice_date?: ?string, invoice_total: float|int|string, used_amount?: float|int|string|null} $data
     */
    public function post(MarketingClaim $claim, array $data, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $data, $user) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            if ($fresh->status !== 'APPROVED' || $fresh->payout_method !== 'POTONG_NOTA') {
                throw ValidationException::withMessages(['claim' => 'Klaim ini tidak berstatus Disetujui dengan metode pencairan Potong Nota.']);
            }

            $invoiceNumber = trim($data['invoice_number']);
            if (MarketingClaimDeduction::where('marketing_claim_id', $fresh->id)->where('invoice_number', $invoiceNumber)->exists()) {
                throw ValidationException::withMessages(['invoice_number' => 'Nota '.$invoiceNumber.' sudah dipotong oleh klaim ini.']);
            }

            $balance = $this->balance($fresh);
            if ($balance <= 0) {
                throw ValidationException::withMessages(['claim' => 'Saldo klaim sudah habis.']);
            }

            $invoiceTotal = round((float) $data['invoice_total'], 2);
            [$used, $capped] = $this->decideUsed($balance, $invoiceTotal, isset($data['used_amount']) ? (float) $data['used_amount'] : null);

            $deduction = MarketingClaimDeduction::create([
                'marketing_claim_id' => $fresh->id,
                'invoice_number' => $invoiceNumber,
                'invoice_date' => $data['invoice_date'] ?? null,
                'invoice_total' => $invoiceTotal,
                'claim_amount_used' => $used,
                'capped_by_invoice' => $capped,
                'misc_charge_code' => (string) config('marketing.claim_deduction.misc_charge_code', 'KLAIM'),
                'misc_charge_amount' => -$used,
                'reference' => $fresh->claim_no,
                'balance_before' => $balance,
                'balance_after' => round($balance - $used, 2),
                'posted_by' => $user->id,
                'posted_at' => now(),
            ]);

            $this->auditLogService->log($user->id, 'marketing_claim.deduction', MarketingClaim::class, $fresh->id, ['balance' => $balance], [
                'deduction_id' => $deduction->id, 'invoice' => $invoiceNumber, 'invoice_total' => $invoiceTotal, 'used' => $used, 'balance_after' => $deduction->balance_after,
            ]);

            return $this->find($fresh->id, $user);
        });
    }
}