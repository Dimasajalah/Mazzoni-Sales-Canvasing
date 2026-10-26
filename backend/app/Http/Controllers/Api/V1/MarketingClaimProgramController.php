<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\MarketingApprovalService;
use App\Services\MarketingEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Program Klaim Entry (MKT04) dan Approval-nya (MKT05). Sementara hanya admin / supervisor. */
class MarketingClaimProgramController extends Controller
{
    public function __construct(
        private readonly MarketingEventService $service,
        private readonly MarketingApprovalService $approval,
    ) {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Program klaim hanya dapat diakses admin atau supervisor', null, 403);
        }

        return null;
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $list = $this->service->list($request->only(['marketing_budget_id', 'status']) + ['kind' => 'KLAIM']);
        foreach ($list as $program) {
            $program->setAttribute('can_act', $this->approval->canAct($program, $request->user()));
            $program->setAttribute(
                'awaiting_label',
                $program->status === 'PENDING_APPROVAL' ? $this->approval->levelLabel($program, (int) $program->approval_stage) : null
            );
        }

        return ApiResponse::success($list);
    }

    public function options(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->claimOptions($request->get('q')));
    }

    public function store(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $data = $request->validate([
            'marketing_budget_id' => ['required', 'integer', 'exists:marketing_budgets,id'],
            'description' => ['required', 'string', 'max:200'],
            'reference_letter_no' => ['required', 'string', 'max:100', 'unique:marketing_events,reference_letter_no'],
            'claim_type' => ['required', 'in:'.implode(',', array_keys(config('marketing.claim_types')))],
            'claim_source' => ['required', 'in:'.implode(',', array_keys(config('marketing.claim_sources')))],
            'claim_basis' => ['required', 'in:'.implode(',', array_keys(config('marketing.claim_bases')))],
            'claim_threshold' => ['nullable', 'numeric', 'min:0', 'max:9999999999999'],
            'claim_rate_type' => ['required', 'in:PERCENT,AMOUNT'],
            'claim_rate' => ['required', 'numeric', 'gt:0', 'max:9999999999999', Rule::when($request->input('claim_rate_type') === 'PERCENT', ['max:100'])],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'claim_deadline' => ['required', 'date', 'after_or_equal:end_date'],
            'target_type' => ['required', 'in:NATIONAL,TERRITORY,CUSTOMER'],
            'territories' => ['required_if:target_type,TERRITORY', 'array'],
            'territories.*' => ['string', 'max:100'],
            'customer_ids' => ['required_if:target_type,CUSTOMER', 'array'],
            'customer_ids.*' => ['integer', 'exists:customers,id'],
            'budget_amount' => ['required', 'numeric', 'gt:0', 'max:9999999999999'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf'],
        ]);

        $files = $request->file('attachments', []) ?: [];
        $program = $this->service->createClaimProgram($data, $request->user(), is_array($files) ? $files : [$files]);

        return ApiResponse::success($program, 'Program klaim berhasil dibuat', 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $program = $this->service->findClaimProgram($id);
        if (! $program) {
            return ApiResponse::error('Program klaim tidak ditemukan', null, 404);
        }

        return ApiResponse::success($this->withApproval($program, $request));
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        return $this->decide($request, $id, 'APPROVE');
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        return $this->decide($request, $id, 'REJECT');
    }

    /** MKT05: Manager Marketing (tahap 1) lalu Direktur Sales (tahap 2); approve maupun reject wajib reason code. */
    private function decide(Request $request, int $id, string $type): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $program = $this->service->findClaimProgram($id);
        if (! $program) {
            return ApiResponse::error('Program klaim tidak ditemukan', null, 404);
        }
        if ($program->status !== 'PENDING_APPROVAL') {
            return ApiResponse::error('Program klaim ini sudah diproses.', null, 422);
        }
        if (! $this->approval->canAct($program, $request->user())) {
            $stage = (int) $program->approval_stage;

            return ApiResponse::error('Anda bukan pemberi persetujuan Tahap '.$stage.' ('.$this->approval->levelLabel($program, $stage).').', null, 403);
        }

        $data = $request->validate([
            'reason_code' => ['required', 'in:'.implode(',', array_keys(config("marketing.approval_reason_codes.{$type}")))],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->approval->act($program, $request->user(), $type, $data['reason_code'], $data['notes'] ?? null);

        return ApiResponse::success(
            $this->withApproval($updated, $request),
            $type === 'APPROVE' ? 'Program klaim disetujui' : 'Program klaim ditolak'
        );
    }

    private function withApproval($program, Request $request)
    {
        $program->setAttribute('approval', $this->approval->summary($program, $request->user()));

        return $program;
    }
}