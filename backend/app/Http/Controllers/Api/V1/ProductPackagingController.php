<?php
// backend/app/Http/Controllers/Api/V1/ProductPackagingController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Concerns\RequiresManager;
use App\Http\Controllers\Controller;
use App\Models\ProductPackaging;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductPackagingController extends Controller
{
    use RequiresManager;

    public function index(Request $request): JsonResponse
    {
        $items = ProductPackaging::query()
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->get('product_id')))
            ->when(! $request->boolean('include_inactive'), fn ($q) => $q->where('active', true))
            ->orderBy('product_id')->orderBy('gramasi_gr')
            ->get();

        return ApiResponse::success($items);
    }

    public function store(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $data = $request->validate([
            'product_id' => ['required', 'exists:products,id'],
            'name' => ['required', 'string', 'max:100'],
            'gramasi_gr' => [
                'required', 'numeric', 'gt:0',
                Rule::unique('product_packagings', 'gramasi_gr')->where('product_id', $request->input('product_id')),
            ],
            'active' => ['nullable', 'boolean'],
        ]);

        return ApiResponse::success(ProductPackaging::create($data), 'Kemasan ditambahkan', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $packaging = ProductPackaging::find($id);
        if (! $packaging) {
            return ApiResponse::error('Kemasan tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'gramasi_gr' => [
                'sometimes', 'numeric', 'gt:0',
                Rule::unique('product_packagings', 'gramasi_gr')->where('product_id', $packaging->product_id)->ignore($packaging->id),
            ],
            'active' => ['sometimes', 'boolean'],
        ]);

        $packaging->update($data);

        return ApiResponse::success($packaging->fresh(), 'Kemasan diperbarui');
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $packaging = ProductPackaging::find($id);
        if (! $packaging) {
            return ApiResponse::error('Kemasan tidak ditemukan', null, 404);
        }

        $packaging->delete();

        return ApiResponse::success(null, 'Kemasan dihapus');
    }
}
