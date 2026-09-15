<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\PromotionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PromotionController extends Controller
{
    public function __construct(private readonly PromotionService $promotionService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->promotionService->list($request->only(['promo_type', 'active', 'q']), (int) $request->get('per_page', 20))
        );
    }

    public function show(int $id): JsonResponse
    {
        $promo = $this->promotionService->find($id);
        if (! $promo) {
            return ApiResponse::error('Promo tidak ditemukan', null, 404);
        }

        return ApiResponse::success($promo);
    }

    public function offer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'promo_id' => ['required', 'exists:promotions,id'],
            'visit_id' => ['nullable', 'exists:visits,id'],
            'offered_at' => ['nullable', 'date'],
        ]);

        return ApiResponse::success(
            $this->promotionService->recordOffer($data, $request->user()),
            'Penawaran promo dicatat',
            201
        );
    }
}
