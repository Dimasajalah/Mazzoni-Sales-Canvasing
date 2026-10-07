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
        $filters = $request->only(['customer_id', 'lead_id', 'salesperson_id']);
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
            // Check-in sekarang bisa menyasar Customer (lama) ATAU Lead langsung (baru) — tepat
            // salah satu yang wajib diisi, lihat VisitService::checkIn().
            'customer_id' => ['nullable', 'required_without:lead_id', 'exists:customers,id'],
            'lead_id' => ['nullable', 'required_without:customer_id', 'exists:leads,id'],
            'latitude' => ['required', 'numeric'],
            'longitude' => ['required', 'numeric'],
            'accuracy' => ['nullable', 'numeric'],
        ]);

        if (! empty($data['customer_id']) && ! empty($data['lead_id'])) {
            return ApiResponse::error('Check-in ditolak', [
                'lead_id' => ['Pilih salah satu: customer atau lead, tidak keduanya.'],
            ], 422);
        }

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
