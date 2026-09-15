<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\VisitService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class VisitController extends Controller
{
    public function __construct(private readonly VisitService $visitService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['customer_id', 'salesperson_id']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->visitService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function show(int $id): JsonResponse
    {
        $visit = $this->visitService->find($id);
        if (! $visit) {
            return ApiResponse::error('Visit tidak ditemukan', null, 404);
        }

        return ApiResponse::success($visit);
    }

    public function checkin(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'latitude' => ['required', 'numeric'],
            'longitude' => ['required', 'numeric'],
            'accuracy' => ['nullable', 'numeric'],
        ]);

        try {
            $visit = $this->visitService->checkIn($data, $request->user());
        } catch (ValidationException $e) {
            return ApiResponse::error('Check-in ditolak', $e->errors(), 422);
        }

        return ApiResponse::success($visit, 'Check-in berhasil', 201);
    }

    public function checkout(Request $request, int $id): JsonResponse
    {
        $visit = $this->visitService->find($id);
        if (! $visit) {
            return ApiResponse::error('Visit tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'visit_result' => ['nullable', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        try {
            $visit = $this->visitService->checkOut($visit, $data, $request->user());
        } catch (ValidationException $e) {
            return ApiResponse::error('Checkout gagal', $e->errors(), 422);
        }

        return ApiResponse::success($visit, 'Checkout berhasil');
    }
}
