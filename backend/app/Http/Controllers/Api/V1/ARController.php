<?php
//backend/app/Http/Controllers/Api/V1/ARController.php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\Aging;
use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Invoice;
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
        $bucket = $request->get('bucket');

        // Satu customer: perilaku lama. Tanpa customer_id: laporan piutang milik pengguna (sales hanya customer miliknya).
        if ($request->filled('customer_id')) {
            return ApiResponse::success($this->arService->aging((int) $request->get('customer_id'), $bucket));
        }

        return ApiResponse::success($this->arService->portfolio($request->user(), $bucket));
    }

    public function customerAging(int $id): JsonResponse
    {
        return ApiResponse::success($this->arService->aging($id));
    }

    public function invoices(Request $request): JsonResponse
    {
        $filters = $request->only(['customer_id', 'status', 'q']);
        if ($request->user()->role === 'sales') {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success(
            $this->arService->invoices($filters, (int) $request->get('per_page', 20))
        );
    }

    public function showInvoice(Request $request, int $id): JsonResponse
    {
        $invoice = $this->arService->findInvoice($id);
        if (! $invoice) {
            return ApiResponse::error('Invoice tidak ditemukan', null, 404);
        }
        if (! Aging::canAccess($invoice, $request->user())) {
            return ApiResponse::error('Invoice ini bukan milik customer Anda', null, 403);
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

        // Sales hanya boleh mencatat pembayaran untuk invoice customer miliknya.
        if (! Aging::canAccess(Invoice::with('customer')->find($data['invoice_id']), $request->user())) {
            return ApiResponse::error('Invoice ini bukan milik customer Anda', null, 403);
        }

        try {
            $payment = $this->paymentService->create($data, $request->user());
        } catch (ValidationException $e) {
            return ApiResponse::error('Pembayaran gagal', $e->errors(), 422);
        }

        return ApiResponse::success($payment, 'Pembayaran berhasil dicatat', 201);
    }
}