<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\ReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReturnController extends Controller
{
    public function __construct(private readonly ReturnService $returnService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['status', 'customer_id', 'salesperson_id']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->returnService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'so_reference' => ['nullable', 'string'],
            'reason' => ['nullable', 'string'],
            'condition_notes' => ['nullable', 'string'],
            'client_uuid' => ['nullable', 'uuid'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'exists:products,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'attachments' => ['nullable', 'array'],
            'attachments.*' => ['file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf'],
        ]);

        $files = $request->file('attachments', []) ?: [];
        $return = $this->returnService->create(
            collect($data)->except(['lines', 'attachments'])->all(),
            $data['lines'],
            $request->user(),
            is_array($files) ? $files : [$files]
        );

        return ApiResponse::success($return, 'Permintaan retur berhasil diajukan', 201);
    }

    public function show(int $id): JsonResponse
    {
        $return = $this->returnService->find($id);
        if (! $return) {
            return ApiResponse::error('Retur tidak ditemukan', null, 404);
        }

        return ApiResponse::success($return);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $return = $this->returnService->find($id);
        if (! $return) {
            return ApiResponse::error('Retur tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'status' => ['required', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        return ApiResponse::success(
            $this->returnService->updateStatus($return, $data['status'], $request->user(), $data['notes'] ?? null),
            'Status retur diperbarui'
        );
    }
}
