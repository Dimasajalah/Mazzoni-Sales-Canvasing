<?php
// backend/app/Http/Controllers/Api/V1/CodeMappingController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Concerns\RequiresManager;
use App\Http\Controllers\Controller;
use App\Models\CodeMapping;
use App\Models\Customer;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Mapping kode SKU produk dan kode Customer ke sistem lain (poin 13). Satu kode lokal = satu kode per sistem. */
class CodeMappingController extends Controller
{
    use RequiresManager;

    public function index(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $items = CodeMapping::query()
            ->when($request->filled('entity_type'), fn ($q) => $q->where('entity_type', $request->get('entity_type')))
            ->when($request->filled('external_system'), fn ($q) => $q->where('external_system', $request->get('external_system')))
            ->orderBy('entity_type')->orderBy('local_id')
            ->get();

        return ApiResponse::success($items);
    }

    /** Simpan (upsert): kode lokal yang sama menimpa mapping lama untuk sistem yang sama. */
    public function store(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $data = $request->validate([
            'entity_type' => ['required', Rule::in([CodeMapping::PRODUCT, CodeMapping::CUSTOMER])],
            'local_id' => ['required', 'integer'],
            'external_system' => ['nullable', 'string', 'max:20'],
            'external_code' => ['required', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $exists = $data['entity_type'] === CodeMapping::PRODUCT
            ? Product::whereKey($data['local_id'])->exists()
            : Customer::whereKey($data['local_id'])->exists();

        if (! $exists) {
            return ApiResponse::error('Data lokal tidak ditemukan', ['local_id' => ['ID tidak ditemukan.']], 422);
        }

        $system = $data['external_system'] ?? 'epicor';

        $mapping = CodeMapping::updateOrCreate(
            ['entity_type' => $data['entity_type'], 'local_id' => $data['local_id'], 'external_system' => $system],
            ['external_code' => $data['external_code'], 'notes' => $data['notes'] ?? null]
        );

        return ApiResponse::success($mapping, 'Mapping disimpan', $mapping->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $mapping = CodeMapping::find($id);
        if (! $mapping) {
            return ApiResponse::error('Mapping tidak ditemukan', null, 404);
        }

        $mapping->delete();

        return ApiResponse::success(null, 'Mapping dihapus');
    }
}
