<?php
// backend/app/Http/Controllers/Api/V1/DiscountStrataController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Concerns\RequiresManager;
use App\Http\Controllers\Controller;
use App\Models\DiscountStratum;
use App\Services\PackagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DiscountStrataController extends Controller
{
    use RequiresManager;

    public function __construct(private readonly PackagingService $packaging)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $items = DiscountStratum::query()
            ->when(! $request->boolean('include_inactive'), fn ($q) => $q->where('active', true))
            ->orderBy('product_id')->orderBy('min_kg')
            ->get();

        return ApiResponse::success($items);
    }

    /** Persen strata untuk produk & jumlah Kg (dipakai pratinjau di aplikasi). */
    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['nullable', 'exists:products,id'],
            'qty_kg' => ['required', 'numeric', 'gt:0'],
        ]);

        return ApiResponse::success([
            'strata_percent' => $this->packaging->strataPercent($data['product_id'] ?? null, (float) $data['qty_kg']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $data = $request->validate([
            'product_id' => ['nullable', 'exists:products,id'],
            'min_kg' => ['required', 'numeric', 'min:0'],
            'max_kg' => ['nullable', 'numeric', 'gt:min_kg'],
            'discount_percent' => ['required', 'numeric', 'between:0,100'],
            'active' => ['nullable', 'boolean'],
        ]);

        return ApiResponse::success(DiscountStratum::create($data), 'Tier strata ditambahkan', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $tier = DiscountStratum::find($id);
        if (! $tier) {
            return ApiResponse::error('Tier tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'product_id' => ['nullable', 'exists:products,id'],
            'min_kg' => ['sometimes', 'numeric', 'min:0'],
            'max_kg' => ['nullable', 'numeric', 'gt:min_kg'],
            'discount_percent' => ['sometimes', 'numeric', 'between:0,100'],
            'active' => ['sometimes', 'boolean'],
        ]);

        $tier->update($data);

        return ApiResponse::success($tier->fresh(), 'Tier strata diperbarui');
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $tier = DiscountStratum::find($id);
        if (! $tier) {
            return ApiResponse::error('Tier tidak ditemukan', null, 404);
        }

        $tier->delete();

        return ApiResponse::success(null, 'Tier strata dihapus');
    }
}
