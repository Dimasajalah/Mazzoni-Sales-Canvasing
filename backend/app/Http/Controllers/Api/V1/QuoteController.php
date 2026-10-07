<?php
// backend/app/Http/Controllers/Api/V1/QuoteController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\User;
use App\Services\DelegationService;
use App\Services\LeadTaskService;
use App\Services\QuoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class QuoteController extends Controller
{
    private const HEADER_RULES = [
        'customer_id' => ['nullable', 'exists:customers,id'],
        'product_sample_id' => ['nullable', 'exists:product_samples,id'],
        'customer_po' => ['nullable', 'string', 'max:100'],
        'due_date' => ['nullable', 'date'],
        'expected_close_date' => ['nullable', 'date'],
        'follow_up_date' => ['nullable', 'date'],
        'expires_at' => ['nullable', 'date'],
        'terms' => ['nullable', 'string', 'max:2000'],
        'payment_term' => ['nullable', 'in:15D,30D,45D'], // samakan dengan QuoteService::PAYMENT_TERMS
        'notes' => ['nullable', 'string', 'max:2000'],
    ];

    private const LINE_RULES = [
        'lines.*.product_id' => ['required', 'exists:products,id'],
        'lines.*.qty_kg' => ['required', 'numeric', 'gt:0'],
        'lines.*.packaging_id' => ['nullable', 'exists:product_packagings,id'],
        'lines.*.gramasi_gr' => ['nullable', 'numeric', 'gt:0'],
        'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
        'lines.*.disc1_percent' => ['nullable', 'numeric', 'between:0,100'],
        'lines.*.disc2_percent' => ['nullable', 'numeric', 'between:0,100'],
        'lines.*.disc3_percent' => ['nullable', 'numeric', 'between:0,100'],
        'lines.*.disc4_percent' => ['nullable', 'numeric', 'between:0,100'],
    ];

    public function __construct(
        private readonly QuoteService $quotes,
        private readonly LeadTaskService $leadTasks,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['lead_id', 'customer_id', 'status', 'salesperson_id', 'q']);
        if ($request->user()->role === 'sales') {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->quotes->list($filters, (int) $request->get('per_page', 20)));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        [$quote, $error] = $this->resolve($request->user(), $id, allowDelegate: true);

        return $error ?? ApiResponse::success($quote);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            ...self::HEADER_RULES,
            'lead_id' => ['nullable', 'exists:leads,id'],
            'client_uuid' => ['nullable', 'uuid'],
            'lines' => ['nullable', 'array'],
            ...self::LINE_RULES,
        ]);

        if (! empty($data['lead_id'])) {
            $lead = Lead::find($data['lead_id']);
            if (! $this->leadTasks->canAccessLead($request->user(), $lead)) {
                return ApiResponse::error('Tidak berhak membuat Quotation untuk prospek ini', null, 403);
            }
        }

        $quote = $this->quotes->create($data, $data['lines'] ?? [], $request->user());

        return ApiResponse::success($quote, 'Quotation dibuat', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        [$quote, $error] = $this->resolve($request->user(), $id);
        if ($error) {
            return $error;
        }

        $data = $request->validate(self::HEADER_RULES);

        return ApiResponse::success($this->quotes->update($quote, $data, $request->user()), 'Quotation diperbarui');
    }

    /** Ganti seluruh baris Quotation. */
    public function replaceLines(Request $request, int $id): JsonResponse
    {
        [$quote, $error] = $this->resolve($request->user(), $id);
        if ($error) {
            return $error;
        }

        $data = $request->validate([
            'lines' => ['present', 'array'],
            ...self::LINE_RULES,
        ]);

        return ApiResponse::success($this->quotes->replaceLines($quote, $data['lines']), 'Baris Quotation disimpan');
    }

    public function markQuoted(Request $request, int $id): JsonResponse
    {
        [$quote, $error] = $this->resolve($request->user(), $id);

        return $error ?? ApiResponse::success($this->quotes->markQuoted($quote, $request->user()), 'Quotation ditandai Quoted');
    }

    public function attachCompetitor(Request $request, int $id): JsonResponse
    {
        [$quote, $error] = $this->resolve($request->user(), $id);
        if ($error) {
            return $error;
        }

        $data = $request->validate([
            'competitor_id' => ['nullable', 'exists:competitors,id'],
            'name' => ['required_without:competitor_id', 'nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:120'],
            'comment' => ['nullable', 'string', 'max:250'],
        ]);

        return ApiResponse::success($this->quotes->attachCompetitor($quote, $data), 'Kompetitor dicatat', 201);
    }

    public function detachCompetitor(Request $request, int $id, int $competitorId): JsonResponse
    {
        [$quote, $error] = $this->resolve($request->user(), $id);

        return $error ?? ApiResponse::success($this->quotes->detachCompetitor($quote, $competitorId), 'Kompetitor dilepas');
    }

    public function convertToOrder(Request $request, int $id): JsonResponse
    {
        if (! $request->user()->canOrder()) {
            return ApiResponse::error('Sales Dealmaker tidak dapat membuat order. Delegasikan prospek yang sudah Win ke Sales Order.', null, 403);
        }

        [$quote, $error] = $this->resolve($request->user(), $id, allowDelegate: true);
        if ($error) {
            return $error;
        }

        $data = $request->validate([
            'customer_id' => ['nullable', 'exists:customers,id'],
            'customer_po' => ['nullable', 'string', 'max:100'],
            'destination' => ['nullable', Rule::in(['HO', 'DISTRIBUTOR'])],
            'distributor_customer_id' => ['required_if:destination,DISTRIBUTOR', 'nullable', 'exists:customers,id'],
        ]);

        $order = $this->quotes->convertToOrder($quote, $data, $request->user());

        return ApiResponse::success([
            'order' => $order,
            'quote' => $this->quotes->find($quote->id),
        ], 'Order dibuat dari Quotation', 201);
    }

    /** @return array{0: ?\App\Models\Quote, 1: ?JsonResponse} */
    private function resolve(User $user, int $id, bool $allowDelegate = false): array
    {
        $quote = $this->quotes->find($id);
        if (! $quote) {
            return [null, ApiResponse::error('Quotation tidak ditemukan', null, 404)];
        }

        if ($user->role === 'sales' && $quote->salesperson_id !== $user->id) {
            // Sales penerima delegasi boleh melihat dan menjadikan order Quotation prospek yang didelegasikan kepadanya
            $delegated = $allowDelegate && $quote->lead && app(DelegationService::class)->isDelegate($user, $quote->lead);
            if (! $delegated) {
                return [null, ApiResponse::error('Tidak berhak mengakses Quotation ini', null, 403)];
            }
        }

        return [$quote, null];
    }
}
