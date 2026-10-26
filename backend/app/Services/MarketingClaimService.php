<?php
namespace App\Services;

use App\Models\Customer;
use App\Models\MarketingClaim;
use App\Models\MarketingClaimAttachment;
use App\Models\MarketingEvent;
use App\Models\MarketingSelloutRow;
use App\Models\MarketingSelloutUpload;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Blueprint MJU 3.2.8 (MKT08 Pengajuan Program Klaim): Claim Entry atas program klaim yang sudah Approved, klaim yang melewati
 * periode menunggu "pass" Direktur Sales, Calculate (nilai eligible dari Parameter Program MKT04 + data Sell Out/AR Invoice),
 * pilihan metode pencairan, lalu diteruskan ke approval (MKT09).
 */
class MarketingClaimService
{
    private const WITH = [
        'program.budget:id,campaign_code,name', 'customer:id,customer_code,name,city', 'passer:id,name', 'attachments',
        'approvals.actor:id,name', 'diffConfirmer:id,name', 'adjuster:id,name', 'finalizer:id,name',
    ];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    // ---------------------------------------------------------------- baca

    /** Program klaim berstatus Approved (pilihan Claim Entry) dan, bila program dipilih, peserta programnya (calon distributor). */
    public function options(?int $programId = null, ?string $q = null): array
    {
        $programs = MarketingEvent::query()->with('budget:id,campaign_code')
            ->where('activity_type', MarketingEvent::CLAIM_TYPE)->where('status', 'APPROVED')->orderByDesc('id')->get()
            ->map(fn (MarketingEvent $p) => [
                'id' => $p->id, 'event_code' => $p->event_code, 'description' => $p->description,
                'claim_type_label' => $p->claim_type_label, 'claim_source' => $p->claim_source, 'claim_source_label' => $p->claim_source_label,
                'claim_deadline' => $p->claim_deadline?->format('Y-m-d'),
                'start_date' => $p->start_date->format('Y-m-d'), 'end_date' => $p->end_date->format('Y-m-d'),
            ])->values();

        $participants = [];
        if ($programId) {
            $q = trim((string) $q);
            $program = MarketingEvent::find($programId);
            if ($program && $program->isClaimProgram()) {
                $participants = $program->participants()
                    ->when($q !== '', fn ($c) => $c->where(fn ($w) => $w->where('customers.name', 'like', "%{$q}%")->orWhere('customers.customer_code', 'like', "%{$q}%")))
                    ->orderBy('customers.name')->limit(20)->get(['customers.id', 'customers.customer_code', 'customers.name', 'customers.city'])
                    ->each->makeHidden('pivot')->values();
            }
        }

        return ['programs' => $programs, 'participants' => $participants];
    }

    public function list(array $filters = []): Collection
    {
        return MarketingClaim::query()->with(self::WITH)
            ->when(! empty($filters['status']), fn ($q) => $q->where('status', $filters['status']))
            ->when(! empty($filters['marketing_event_id']), fn ($q) => $q->where('marketing_event_id', (int) $filters['marketing_event_id']))
            ->orderByDesc('id')->get();
    }

    public function find(int $id): ?MarketingClaim
    {
        return MarketingClaim::with(self::WITH)->find($id);
    }

    /** Apa yang boleh dilakukan pengguna ini pada klaim ini, beserta alasan bila Calculate belum bisa. */
    public function flags(MarketingClaim $claim, User $user): array
    {
        [$canCalculate, $blocker] = $this->calculateState($claim, $claim->program);

        return [
            'can_pass' => $claim->status === 'PENDING_PASS' && $this->canDecideLate($user),
            'pass_label' => config('marketing.claim_submission.late_pass.label'),
            'can_calculate' => $canCalculate,
            'calculate_blocker' => $blocker,
            'can_submit' => $claim->status === 'CALCULATED',
            'payout_methods' => collect(config('marketing.claim_submission.payout_methods'))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all(),
            'reason_codes' => [
                'APPROVE' => $this->codes('APPROVE'),
                'REJECT' => $this->codes('REJECT'),
            ],
        ];
    }

    public function canDecideLate(User $user): bool
    {
        $level = config('marketing.claim_submission.late_pass');
        $emails = array_map('mb_strtolower', $level['emails'] ?? []);

        return in_array($user->role, $level['roles'] ?? [], true) || in_array(mb_strtolower((string) $user->email), $emails, true);
    }

    // ------------------------------------------------------------ Claim Entry

    /**
     * @param array<int, UploadedFile> $letters    Surat Klaim Distributor (Dokumen 01)
     * @param array<int, UploadedFile> $worksheets Kertas Kerja Klaim (Dokumen 02)
     */
    public function create(array $data, User $user, array $letters = [], array $worksheets = []): MarketingClaim
    {
        $program = MarketingEvent::with('budget')->find($data['program_id']);
        if (! $program || ! $program->isClaimProgram()) {
            throw ValidationException::withMessages(['program_id' => 'Program klaim tidak ditemukan.']);
        }
        if ($program->status !== 'APPROVED') {
            throw ValidationException::withMessages(['program_id' => 'Hanya program klaim yang sudah disetujui (Approved) yang bisa diajukan klaimnya.']);
        }
        if (! $program->participants()->where('customers.id', $data['customer_id'])->exists()) {
            throw ValidationException::withMessages(['customer_id' => 'Distributor ini bukan peserta program klaim.']);
        }

        $received = Carbon::parse($data['letter_received_date'])->format('Y-m-d');
        $late = $program->claim_deadline && $received > $program->claim_deadline->format('Y-m-d');

        return DB::transaction(function () use ($data, $user, $program, $received, $late, $letters, $worksheets) {
            $claim = MarketingClaim::create([
                'claim_no' => $this->nextNumber(),
                'marketing_event_id' => $program->id,
                'customer_id' => $data['customer_id'],
                'letter_received_date' => $received,
                'claimed_amount' => $data['claimed_amount'],
                'notes' => $data['notes'] ?? null,
                'is_late' => $late,
                // Melewati periode klaim: status Pending dan butuh persetujuan khusus (klaim tidak ditolak sistem).
                'status' => $late ? 'PENDING_PASS' : 'DRAFT',
                'created_by' => $user->id,
            ]);

            foreach ([['LETTER', $letters], ['WORKSHEET', $worksheets]] as [$kind, $files]) {
                foreach ($files as $file) {
                    MarketingClaimAttachment::create([
                        'marketing_claim_id' => $claim->id, 'kind' => $kind,
                        'path' => $file->store('marketing-claims/'.$claim->id, 'public'),
                        'filename' => $file->getClientOriginalName(), 'mime' => $file->getClientMimeType(), 'size' => $file->getSize() ?: 0,
                    ]);
                }
            }

            $this->auditLogService->log($user->id, 'marketing_claim.create', MarketingClaim::class, $claim->id, null, [
                'claim_no' => $claim->claim_no, 'program' => $program->id, 'customer' => $claim->customer_id, 'late' => $late, 'amount' => $claim->claimed_amount,
            ]);

            return $this->find($claim->id);
        });
    }

    /** Keputusan Direktur Sales atas klaim yang melewati periode: PASS (lanjut) atau REFUSE (proses berhenti). */
    public function decideLate(MarketingClaim $claim, User $user, string $type, string $reasonCode, ?string $notes = null): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $user, $type, $reasonCode, $notes) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            if ($fresh->status !== 'PENDING_PASS') {
                throw ValidationException::withMessages(['status' => 'Klaim ini tidak sedang menunggu keputusan khusus.']);
            }
            if (! $this->canDecideLate($user)) {
                throw new AuthorizationException('Anda bukan pemberi keputusan khusus ('.config('marketing.claim_submission.late_pass.label').').');
            }

            $fresh->update([
                'status' => $type === 'PASS' ? 'DRAFT' : 'STOPPED',
                'pass_decision' => $type === 'PASS' ? 'PASSED' : 'REFUSED',
                'pass_by' => $user->id, 'pass_at' => now(), 'pass_reason_code' => $reasonCode, 'pass_notes' => $notes,
            ]);

            $this->auditLogService->log($user->id, $type === 'PASS' ? 'marketing_claim.pass' : 'marketing_claim.refuse', MarketingClaim::class, $fresh->id,
                ['status' => 'PENDING_PASS'], ['status' => $fresh->status, 'reason_code' => $reasonCode]);

            return $this->find($fresh->id);
        });
    }

    // -------------------------------------------------------------- Calculate

    /** Menghitung Nilai Eligible Klaim dan Selisih dari Parameter Program (MKT04); tidak diketik manual. */
    public function calculate(MarketingClaim $claim, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $user) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            $program = MarketingEvent::with('budget')->findOrFail($fresh->marketing_event_id);

            [$can, $blocker] = $this->calculateState($fresh, $program);
            if (! $can) {
                throw ValidationException::withMessages(['status' => $blocker]);
            }

            [$base, $source] = $program->claim_source === 'SELL_OUT' ? $this->baseFromSellOut($program) : $this->baseFromSellIn($program, $fresh);
            [$eligible, $met, $formula] = $this->computeEligible($program, $base);

            $fresh->update([
                'status' => 'CALCULATED',
                'eligible_amount' => $eligible,
                'difference_amount' => round((float) $fresh->claimed_amount - $eligible, 2),
                'calc_detail' => $source + [
                    'basis' => $program->claim_basis, 'basis_label' => $program->claim_basis_label,
                    'base_value' => $base,
                    'threshold' => $program->claim_threshold !== null ? (float) $program->claim_threshold : null,
                    'threshold_met' => $met,
                    'rate' => (float) $program->claim_rate, 'rate_type' => $program->claim_rate_type,
                    'formula' => $formula,
                ],
                'calculated_at' => now(), 'calculated_by' => $user->id,
            ]);

            $this->auditLogService->log($user->id, 'marketing_claim.calculate', MarketingClaim::class, $fresh->id, null, [
                'eligible' => $eligible, 'difference' => $fresh->difference_amount, 'base' => $base, 'source' => $source['source'],
            ]);

            return $this->find($fresh->id);
        });
    }

    /**
     * Nilai eligible dari Parameter Program. Aturan (asumsi, dokumen tidak merinci rumusnya):
     * ambang belum tercapai = 0; persen = persen x basis; nominal dengan basis Kuantitas = besaran x kuantitas;
     * nominal dengan basis Nilai Penjualan = besaran tetap bila ambang tercapai.
     *
     * @return array{0: float, 1: bool, 2: string} [nilai eligible, ambang tercapai, rumus yang dipakai]
     */
    public function computeEligible(MarketingEvent $program, float $base): array
    {
        $quantity = $program->claim_basis === 'QUANTITY';
        $fmt = fn (float $v) => $quantity ? $this->num($v) : 'Rp '.$this->num($v);
        $threshold = $program->claim_threshold !== null ? (float) $program->claim_threshold : null;
        $rate = (float) $program->claim_rate;

        if ($threshold !== null && $base < $threshold) {
            return [0.0, false, 'Ambang belum tercapai: '.$fmt($base).' kurang dari ambang '.$fmt($threshold).', nilai eligible 0.'];
        }

        if ($program->claim_rate_type === 'PERCENT') {
            $eligible = round($base * $rate / 100, 2);

            return [$eligible, true, $this->num($rate).'% x '.$fmt($base).' = Rp '.$this->num($eligible)];
        }
        if ($quantity) {
            $eligible = round($base * $rate, 2);

            return [$eligible, true, 'Rp '.$this->num($rate).' x '.$this->num($base).' = Rp '.$this->num($eligible)];
        }

        return [round($rate, 2), true, 'Nominal tetap Rp '.$this->num($rate).' (ambang tercapai)'];
    }

    // ----------------------------------------------------------------- Submit

    /** Menentukan Metode Pencairan lalu meneruskan klaim ke approval (MKT09). */
    public function submit(MarketingClaim $claim, string $method, User $user): MarketingClaim
    {
        return DB::transaction(function () use ($claim, $method, $user) {
            $fresh = MarketingClaim::whereKey($claim->id)->lockForUpdate()->firstOrFail();
            if ($fresh->status !== 'CALCULATED') {
                throw ValidationException::withMessages(['status' => in_array($fresh->status, ['SUBMITTED', 'IN_APPROVAL', 'AWAITING_AMOUNT', 'APPROVED', 'DISBURSED', 'REJECTED'], true)
                    ? 'Klaim ini sudah diajukan untuk approval.'
                    : 'Klaim harus dihitung (Calculate) dulu sebelum diajukan.']);
            }

            $fresh->update(['payout_method' => $method, 'status' => 'SUBMITTED', 'submitted_at' => now(), 'submitted_by' => $user->id]);
            $this->auditLogService->log($user->id, 'marketing_claim.submit', MarketingClaim::class, $fresh->id, ['status' => 'CALCULATED'], ['status' => 'SUBMITTED', 'payout_method' => $method]);

            return $this->find($fresh->id);
        });
    }

    // ---------------------------------------------------------------- privat

    /** @return array{0: bool, 1: ?string} [boleh Calculate, alasan bila tidak] */
    private function calculateState(MarketingClaim $claim, MarketingEvent $program): array
    {
        $label = config('marketing.claim_submission.late_pass.label');

        return match (true) {
            $claim->status === 'PENDING_PASS' => [false, 'Klaim melewati periode klaim dan menunggu persetujuan khusus '.$label.'.'],
            $claim->status === 'STOPPED' => [false, 'Klaim dihentikan karena tidak di-pass oleh '.$label.'.'],
            ! in_array($claim->status, ['DRAFT', 'CALCULATED'], true) => [false, 'Klaim sudah diajukan untuk approval.'],
            $program->claim_source === 'SELL_OUT' && ! $this->currentSellOut($program) => [false, 'Data sell out belum divalidasi. Tombol Calculate aktif setelah data valid diunggah pada program klaim.'],
            default => [true, null],
        };
    }

    private function currentSellOut(MarketingEvent $program): ?MarketingSelloutUpload
    {
        return MarketingSelloutUpload::where('marketing_event_id', $program->id)->where('status', 'VALID')->orderByDesc('id')->first();
    }

    /** Sell Out: seluruh data valid program (template MKT07 belum memisahkan distributor). */
    private function baseFromSellOut(MarketingEvent $program): array
    {
        $upload = $this->currentSellOut($program);
        $rows = MarketingSelloutRow::where('upload_id', $upload->id);
        $base = $program->claim_basis === 'QUANTITY' ? (float) $rows->sum('qty') : (float) $rows->sum('amount');

        return [$base, [
            'source' => 'SELL_OUT', 'upload_id' => $upload->id, 'rows' => (int) $rows->count(),
            'note' => 'Seluruh data sell out program dihitung (template belum memisahkan distributor).',
        ]];
    }

    /** Sell In: nilai dibaca dari AR Invoice distributor dalam periode program, tanpa upload. */
    private function baseFromSellIn(MarketingEvent $program, MarketingClaim $claim): array
    {
        $cfg = (array) config('marketing.sellin');
        $table = $this->identifier($cfg['table']);
        if (! Schema::hasTable($table)) {
            throw ValidationException::withMessages(['sellin' => 'Perhitungan Sell In membaca AR Invoice, tetapi tabel "'.$table.'" tidak ditemukan. Sesuaikan marketing.sellin di config/marketing.php.']);
        }

        $customer = $this->pickColumn($table, $cfg['customer_columns']);
        $date = $this->pickColumn($table, $cfg['date_columns']);
        $start = $program->start_date->format('Y-m-d');
        $end = $program->end_date->format('Y-m-d');

        $invoices = DB::table($table)->where("{$table}.{$customer}", $claim->customer_id)
            ->whereDate("{$table}.{$date}", '>=', $start)->whereDate("{$table}.{$date}", '<=', $end);

        if ($program->claim_basis === 'QUANTITY') {
            $lines = $this->identifier($cfg['lines_table']);
            if (! Schema::hasTable($lines)) {
                throw ValidationException::withMessages(['sellin' => 'Basis Kuantitas membaca baris AR Invoice, tetapi tabel "'.$lines.'" tidak ditemukan. Sesuaikan marketing.sellin di config/marketing.php.']);
            }
            $invoiceKey = $this->pickColumn($lines, $cfg['lines_invoice_columns']);
            $qty = $this->pickColumn($lines, $cfg['lines_qty_columns']);
            $base = (float) DB::table($lines)->join($table, "{$lines}.{$invoiceKey}", '=', "{$table}.id")
                ->where("{$table}.{$customer}", $claim->customer_id)->whereDate("{$table}.{$date}", '>=', $start)->whereDate("{$table}.{$date}", '<=', $end)
                ->sum("{$lines}.{$qty}");
        } else {
            $base = (float) (clone $invoices)->sum("{$table}.".$this->pickColumn($table, $cfg['amount_columns']));
        }

        return [$base, ['source' => 'SELL_IN', 'invoice_count' => (int) (clone $invoices)->count(), 'note' => 'Nilai dibaca dari AR Invoice distributor pada periode program.']];
    }

    private function pickColumn(string $table, array $candidates): string
    {
        foreach ($candidates as $column) {
            if (preg_match('/^[a-z_][a-z0-9_]*$/i', (string) $column) && Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        throw ValidationException::withMessages(['sellin' => 'Kolom AR Invoice tidak dikenali di tabel "'.$table.'" (dicoba: '.implode(', ', $candidates).'). Sesuaikan marketing.sellin di config/marketing.php.']);
    }

    private function identifier(string $name): string
    {
        if (! preg_match('/^[a-z_][a-z0-9_]*$/i', $name)) {
            throw new RuntimeException('Nama tabel pada marketing.sellin tidak valid.');
        }

        return $name;
    }

    private function codes(string $type): array
    {
        return collect(config("marketing.approval_reason_codes.{$type}"))->map(fn ($label, $value) => ['value' => $value, 'label' => $label])->values()->all();
    }

    private function num(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, ',', '.'), '0'), ',');
    }

    private function nextNumber(): string
    {
        $prefix = 'CLM-'.now()->format('Y').'-';
        $last = MarketingClaim::where('claim_no', 'like', $prefix.'%')->orderByDesc('claim_no')->value('claim_no');
        $seq = $last && preg_match('/(\d+)$/', $last, $m) ? ((int) $m[1]) + 1 : 1;

        return $prefix.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }
}