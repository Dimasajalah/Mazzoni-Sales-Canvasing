<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\InventoryService;
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function __construct(
        private readonly InventoryService $inventoryService,
        private readonly ProductService $productService
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->inventoryService->list($request->only(['q', 'warehouse']), (int) $request->get('per_page', 50))
        );
    }

    public function products(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->productService->list($request->only(['q', 'active']), (int) $request->get('per_page', 50))
        );
    }

    public function byProduct(int $productId): JsonResponse
    {
        return ApiResponse::success($this->inventoryService->byProduct($productId));
    }
}
