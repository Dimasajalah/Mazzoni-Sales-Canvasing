<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MarketingEvent;
use App\Services\MarketingApprovalService;
use App\Services\MarketingEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Event Entry (Blueprint MJU 3.2.2 / MKT02) dan Approval Event (3.2.6 / MKT06). Sementara hanya admin / supervisor. */
class MarketingEventController extends Controller
{
    public function __construct(
        private readonly MarketingEventService $service,
        private readonly MarketingApprovalService $approval,
    ) {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Event marketing hanya dapat diakses admin atau supervisor', null, 403);
        }

        return null;
    }

    /** Event biasa saja: program klaim punya jalurnya sendiri (/marketing/claim-programs). */
    private function findEvent(int $id): ?MarketingEvent
    {
        $event = $this->service->find($id);

        return $event && ! $event->isClaimProgram() ? $event : null;
    }

    private function rules(Request $request, ?int $ignoreId = null): array
    {
        return [
            'description' => ['required', 'string', 'max:200'],
            'reference_letter_no' => ['required', 'string', 'max:100', Rule::unique('marketing_events', 'reference_letter_no')->ignore($ignoreId)],
            'activity_type' => ['required', 'in:'.implode(',', array_keys(config('marketing.activity_types')))],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'target_type' => ['required', 'in:NATIONAL,TERRITORY,CUSTOMER'],
            'territories' => ['required_if:target_type,TERRITORY', 'array'],
            'territories.*' => ['string', 'max:100'],
            'customer_ids' => ['required_if:target_type,CUSTOMER', 'array'],
            'customer_ids.*' => ['integer', 'exists:customers,id'],
            'budget_amount' => ['required', 'numeric', 'gt:0', 'max:9999999999999'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf'],
        ];
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $list = $this->service->list($request->only(['marketing_budget_id', 'status', 'kind']));
        foreach ($list as $event) {
            $event->setAttribute('can_act', $this->approval->canAct($event, $request->user()));
            $event->setAttribute(
                'awaiting_label',
                $event->status === 'PENDING_APPROVAL' ? $this->approval->levelLabel($event, (int) $event->approval_stage) : null
            );
        }

        return ApiResponse::success($list);
    }

    public function options(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->options($request->get('q')));
    }

    public function store(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $data = $request->validate(['marketing_budget_id' => ['required', 'integer', 'exists:marketing_budgets,id']] + $this->rules($request));

        $files = $request->file('attachments', []) ?: [];
        $event = $this->service->create($data, $request->user(), is_array($files) ? $files : [$files]);

        return ApiResponse::success($event, 'Event marketing berhasil dibuat', 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $event = $this->findEvent($id);
        if (! $event) {
            return ApiResponse::error('Event marketing tidak ditemukan', null, 404);
        }

        return ApiResponse::success($this->present($event, $request));
    }

    /** MKT06: event yang ditolak direvisi lalu diajukan ulang dari tahap 1. POST (bukan PUT) supaya lampiran multipart terbaca. */
    public function revise(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $event = $this->findEvent($id);
        if (! $event) {
            return ApiResponse::error('Event marketing tidak ditemukan', null, 404);
        }

        $data = $request->validate($this->rules($request, $event->id));
        $files = $request->file('attachments', []) ?: [];
        $revised = $this->service->revise($event, $data, $request->user(), is_array($files) ? $files : [$files]);

        return ApiResponse::success($this->present($revised, $request), 'Event direvisi dan diajukan ulang');
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        return $this->decide($request, $id, 'APPROVE');
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        return $this->decide($request, $id, 'REJECT');
    }

    /** MKT06: Tahap 1 sampai 5 (dan 6 bila RAB di atas 30 juta); approve maupun reject wajib reason code. */
    private function decide(Request $request, int $id, string $type): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $event = $this->findEvent($id);
        if (! $event) {
            return ApiResponse::error('Event marketing tidak ditemukan', null, 404);
        }
        if ($event->status !== 'PENDING_APPROVAL') {
            return ApiResponse::error('Event ini sudah diproses.', null, 422);
        }
        if (! $this->approval->canAct($event, $request->user())) {
            $stage = (int) $event->approval_stage;

            return ApiResponse::error('Anda bukan pemberi persetujuan Tahap '.$stage.' ('.$this->approval->levelLabel($event, $stage).').', null, 403);
        }

        $data = $request->validate([
            'reason_code' => ['required', 'in:'.implode(',', array_keys(config("marketing.approval_reason_codes.{$type}")))],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $updated = $this->approval->act($event, $request->user(), $type, $data['reason_code'], $data['notes'] ?? null);

        return ApiResponse::success($this->present($updated, $request), $type === 'APPROVE' ? 'Event disetujui' : 'Event ditolak');
    }

    /** Detail event + ringkasan persetujuan; untuk target Customer, seluruh customer pilihan (dipakai form revisi). */
    private function present(MarketingEvent $event, Request $request): MarketingEvent
    {
        $event->setAttribute('approval', $this->approval->summary($event, $request->user()));
        if ($event->target_type === 'CUSTOMER') {
            $event->setAttribute(
                'target_customers',
                $event->participants()->orderBy('customers.name')->get(['customers.id', 'customers.customer_code', 'customers.name', 'customers.city'])
                    ->each->makeHidden('pivot')->values()
            );
        }

        return $event;
    }
}