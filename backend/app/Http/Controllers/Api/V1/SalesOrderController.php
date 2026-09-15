<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\SalesOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SalesOrderController extends Controller
{
    public function __construct(private readonly SalesOrderService $salesOrderService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['status', 'customer_id', 'salesperson_id', 'q']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->salesOrderService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'customer_po' => ['nullable', 'string', 'max:100'],
            'order_date' => ['nullable', 'date'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'promo_id' => ['nullable', 'exists:promotions,id'],
            'notes' => ['nullable', 'string'],
            'client_uuid' => ['nullable', 'uuid'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'exists:products,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'lines.*.discount' => ['nullable', 'numeric', 'min:0'],
            'lines.*.uom' => ['nullable', 'string'],
        ]);

        $header = collect($data)->except('lines')->all();
        $order = $this->salesOrderService->create($header, $data['lines'], $request->user());

        return ApiResponse::success($order, 'Order berhasil dibuat', 201);
    }

    public function show(int $id): JsonResponse
    {
        $order = $this->salesOrderService->find($id);
        if (! $order) {
            return ApiResponse::error('Order tidak ditemukan', null, 404);
        }

        return ApiResponse::success($order);
    }

    public function tracker(int $id): JsonResponse
    {
        $tracker = $this->salesOrderService->tracker($id);
        if (! $tracker) {
            return ApiResponse::error('Order tidak ditemukan', null, 404);
        }

        return ApiResponse::success($tracker);
    }
}
