<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MarketingClaim;
use App\Services\MarketingClaimApprovalService;
use App\Services\MarketingClaimService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Pengajuan Program Klaim (Blueprint MJU 3.2.8 / MKT08). Sementara hanya admin / supervisor. */
class MarketingClaimController extends Controller
{
    public function __construct(
        private readonly MarketingClaimService $service,
        private readonly MarketingClaimApprovalService $approval,
    ) {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Pengajuan klaim hanya dapat diakses admin atau supervisor', null, 403);
        }

        return null;
    }

    private function present(MarketingClaim $claim, Request $request): MarketingClaim
    {
        $claim->setAttribute('flags', $this->service->flags($claim, $request->user()) + ['approval' => $this->approval->summary($claim, $request->user())]);

        return $claim;
    }

    public function options(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->options($request->integer('program_id') ?: null, $request->get('q')));
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $list = $this->service->list($request->only(['status', 'marketing_event_id']));
        foreach ($list as $claim) {
            $claim->setAttribute('can_pass', $claim->status === 'PENDING_PASS' && $this->service->canDecideLate($request->user()));
            $claim->setAttribute('can_act', $this->approval->canConfirm($claim, $request->user()) || $this->approval->canAct($claim, $request->user()));
            $claim->setAttribute('awaiting_label', $this->approval->awaitingLabel($claim));
        }

        return ApiResponse::success($list);
    }

    public function store(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $data = $request->validate([
            'program_id' => ['required', 'integer', 'exists:marketing_events,id'],
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'letter_received_date' => ['required', 'date'],
            'claimed_amount' => ['required', 'numeric', 'gt:0', 'max:9999999999999'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'letters' => ['nullable', 'array', 'max:5'],
            'letters.*' => ['file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf'],
            'worksheets' => ['nullable', 'array', 'max:5'],
            'worksheets.*' => ['file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf,csv,txt'],
        ]);

        $letters = $request->file('letters', []) ?: [];
        $worksheets = $request->file('worksheets', []) ?: [];
        $claim = $this->service->create($data, $request->user(), is_array($letters) ? $letters : [$letters], is_array($worksheets) ? $worksheets : [$worksheets]);

        return ApiResponse::success($this->present($claim, $request), 'Pengajuan klaim dibuat', 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);

        return $claim ? ApiResponse::success($this->present($claim, $request)) : ApiResponse::error('Pengajuan klaim tidak ditemukan', null, 404);
    }

    /** Direktur Sales mem-pass klaim yang melewati periode, sehingga proses lanjut. */
    public function pass(Request $request, int $id): JsonResponse
    {
        return $this->decideLate($request, $id, 'PASS');
    }

    /** Klaim yang melewati periode dan tidak di-pass: proses berhenti. */
    public function refuse(Request $request, int $id): JsonResponse
    {
        return $this->decideLate($request, $id, 'REFUSE');
    }

    private function decideLate(Request $request, int $id, string $type): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);
        if (! $claim) {
            return ApiResponse::error('Pengajuan klaim tidak ditemukan', null, 404);
        }
        if ($claim->status !== 'PENDING_PASS') {
            return ApiResponse::error('Klaim ini tidak sedang menunggu keputusan khusus.', null, 422);
        }
        if (! $this->service->canDecideLate($request->user())) {
            return ApiResponse::error('Anda bukan pemberi keputusan khusus ('.config('marketing.claim_submission.late_pass.label').').', null, 403);
        }

        // pass memakai kode alasan setuju, tolak memakai kode alasan tolak
        $codes = array_keys(config('marketing.approval_reason_codes.'.($type === 'PASS' ? 'APPROVE' : 'REJECT')));
        $data = $request->validate([
            'reason_code' => ['required', Rule::in($codes)],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->service->decideLate($claim, $request->user(), $type, $data['reason_code'], $data['notes'] ?? null);

        return ApiResponse::success($this->present($updated, $request), $type === 'PASS' ? 'Klaim di-pass, proses dilanjutkan' : 'Klaim tidak di-pass, proses dihentikan');
    }

    public function calculate(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);
        if (! $claim) {
            return ApiResponse::error('Pengajuan klaim tidak ditemukan', null, 404);
        }

        return ApiResponse::success($this->present($this->service->calculate($claim, $request->user()), $request), 'Nilai klaim dihitung');
    }

    /** MKT09 langkah 01: Koordinator Marketing mencatat bahwa distributor menyetujui nilai selisih (konfirmasi di luar sistem). */
    public function confirmDifference(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);
        if (! $claim) {
            return ApiResponse::error('Pengajuan klaim tidak ditemukan', null, 404);
        }
        if ($claim->status !== 'SUBMITTED') {
            return ApiResponse::error('Klaim ini tidak sedang menunggu konfirmasi selisih.', null, 422);
        }
        if (! $this->approval->canConfirm($claim, $request->user())) {
            return ApiResponse::error('Konfirmasi selisih dilakukan oleh '.$this->approval->levelLabel(1).'.', null, 403);
        }

        $data = $request->validate(['notes' => ['nullable', 'string', 'max:500']]);

        return ApiResponse::success(
            $this->present($this->approval->confirmDifference($claim, $request->user(), $data['notes'] ?? null), $request),
            'Selisih dikonfirmasi, approval dimulai'
        );
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        return $this->decideApproval($request, $id, 'APPROVE');
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        return $this->decideApproval($request, $id, 'REJECT');
    }

    /** MKT09 langkah 02-06: tahap 1 sampai 4; menolak menghentikan klaim; Direktur Sales (tahap terakhir) boleh menyesuaikan nilai. */
    private function decideApproval(Request $request, int $id, string $type): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);
        if (! $claim) {
            return ApiResponse::error('Pengajuan klaim tidak ditemukan', null, 404);
        }
        if ($claim->status !== 'IN_APPROVAL') {
            return ApiResponse::error('Klaim ini tidak sedang dalam proses approval.', null, 422);
        }
        if (! $this->approval->canAct($claim, $request->user())) {
            $stage = (int) $claim->approval_stage;

            return ApiResponse::error('Anda bukan pemberi persetujuan Tahap '.$stage.' ('.$this->approval->levelLabel($stage).').', null, 403);
        }

        $data = $request->validate([
            'reason_code' => ['required', Rule::in(array_keys(config("marketing.approval_reason_codes.{$type}")))],
            'notes' => ['nullable', 'string', 'max:500'],
            'adjusted_amount' => ['nullable', 'numeric', 'max:9999999999999'],
            'adjust_reason' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->approval->act(
            $claim, $request->user(), $type, $data['reason_code'], $data['notes'] ?? null,
            isset($data['adjusted_amount']) ? (float) $data['adjusted_amount'] : null, $data['adjust_reason'] ?? null
        );

        return ApiResponse::success($this->present($updated, $request), $type === 'APPROVE' ? 'Persetujuan tersimpan' : 'Klaim ditolak');
    }

    /** MKT09 langkah 07: Marketing menetapkan Nilai Klaim Disetujui sebagai nilai final. */
    public function approvedAmount(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);
        if (! $claim) {
            return ApiResponse::error('Pengajuan klaim tidak ditemukan', null, 404);
        }

        $data = $request->validate(['amount' => ['required', 'numeric', 'gt:0', 'max:9999999999999']]);

        return ApiResponse::success(
            $this->present($this->approval->finalizeAmount($claim, $request->user(), (float) $data['amount']), $request),
            'Nilai Klaim Disetujui tersimpan'
        );
    }

    public function submit(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);
        if (! $claim) {
            return ApiResponse::error('Pengajuan klaim tidak ditemukan', null, 404);
        }

        $data = $request->validate(['payout_method' => ['required', Rule::in(array_keys(config('marketing.claim_submission.payout_methods')))]]);

        return ApiResponse::success($this->present($this->service->submit($claim, $data['payout_method'], $request->user()), $request), 'Klaim diajukan untuk approval');
    }
}