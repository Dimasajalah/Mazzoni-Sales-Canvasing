<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\ARService;
use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ARController extends Controller
{
    public function __construct(
        private readonly ARService $arService,
        private readonly PaymentService $paymentService
    ) {
    }

    public function aging(Request $request): JsonResponse
    {
        $customerId = $request->filled('customer_id') ? (int) $request->get('customer_id') : null;
        $bucket = $request->get('bucket');

        return ApiResponse::success($this->arService->aging($customerId, $bucket));
    }

    public function customerAging(int $id): JsonResponse
    {
        return ApiResponse::success($this->arService->aging($id));
    }

    public function invoices(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->arService->invoices($request->only(['customer_id', 'status', 'q']), (int) $request->get('per_page', 20))
        );
    }

    public function showInvoice(int $id): JsonResponse
    {
        $invoice = $this->arService->findInvoice($id);
        if (! $invoice) {
            return ApiResponse::error('Invoice tidak ditemukan', null, 404);
        }

        return ApiResponse::success($invoice);
    }

    public function payments(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->paymentService->list($request->only(['customer_id', 'invoice_id']), (int) $request->get('per_page', 20))
        );
    }

    public function storePayment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'invoice_id' => ['required', 'exists:invoices,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'method' => ['required', 'string'],
            'reference' => ['nullable', 'string'],
            'payment_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        try {
            $payment = $this->paymentService->create($data, $request->user());
        } catch (ValidationException $e) {
            return ApiResponse::error('Pembayaran gagal', $e->errors(), 422);
        }

        return ApiResponse::success($payment, 'Pembayaran berhasil dicatat', 201);
    }
}
