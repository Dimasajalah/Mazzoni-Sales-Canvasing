<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\InventoryService;
use App\Services\ProductService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function __construct(
        private readonly InventoryService $inventoryService,
        private readonly ProductService $productService
    ) {}

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->inventoryService->list($request->only(['q', 'warehouse']), (int) $request->get('per_page', 50))
        );
    }

    public function products(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->productService->list($request->only(['q', 'active', 'product_group']), (int) $request->get('per_page', 50))
        );
    }

    public function byProduct(int $productId): JsonResponse
    {
        return ApiResponse::success($this->inventoryService->byProduct($productId));
    }

    public function productGroups(): JsonResponse
    {
        $groups = Product::query()
            ->where('active', true)
            ->whereNotNull('product_group')
            ->where('product_group', '!=', '')
            ->distinct()
            ->orderBy('product_group')
            ->pluck('product_group')
            ->values();

        return ApiResponse::success($groups);
    }

    public function setMoq(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['moq_kg' => ['nullable', 'numeric', 'min:0.001']]);

        $product = Product::findOrFail($id);
        $product->update(['moq_kg' => $data['moq_kg'] ?? null]);

        return ApiResponse::success($product->fresh(), 'MOQ produk diperbarui');
        }
    
        /**
         * Poin 18/20/21: set epicor_part_num & product_group sebuah produk. Endpoint sementara untuk
         * tes/staging — sama alasannya dengan setMoq() di atas, sampai sinkronisasi Epicor berjalan.
         */
        public function setRegistration(Request $request, int $id): JsonResponse
        {
            $data = $request->validate([
                'epicor_part_num' => ['nullable', 'string', 'max:50'],
                'product_group' => ['nullable', 'string', 'max:100'],
            ]);
    
            $product = Product::findOrFail($id);
            $product->update($data);
    
            return ApiResponse::success($product->fresh(), 'Registrasi produk diperbarui');
            }
        
            /**
             * Poin 22: reformula menaikkan Revision dari kode part yang SAMA (bukan kode part baru).
             * Dipakai saat repeat order dengan formula yang sudah diubah.
             */
            public function reviseProduct(int $id): JsonResponse
            {
                $product = Product::findOrFail($id);
                $product->update(['revision' => $product->revision + 1]);
        
                return ApiResponse::success($product->fresh(), 'Revision produk dinaikkan');
            }
        }
