<?php
// backend/app/Http/Controllers/Api/V1/SalesOrderController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\AccessPolicy;
use App\Services\DelegationService;
use App\Services\SalesOrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SalesOrderController extends Controller
{
    public function __construct(
        private readonly SalesOrderService $salesOrderService,
        private readonly AccessPolicy $access
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        // Peran terbatas (mis. sales) selalu dipaksa ke order miliknya; salesperson_id dari klien diabaikan
        $filters = $this->access->scopeFilters($request->user(), $request->only(['status', 'customer_id', 'salesperson_id', 'q']));

        return ApiResponse::success($this->salesOrderService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        // Sales Dealmaker tidak boleh membuat order (poin 11): prospek yang sudah Win didelegasikan ke Sales Order
        if (! $request->user()->canOrder()) {
            return ApiResponse::error('Sales Dealmaker tidak dapat membuat order. Delegasikan prospek yang sudah Win ke Sales Order.', null, 403);
        }

        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'lead_id' => ['nullable', 'exists:leads,id'],
            'customer_po' => ['nullable', 'string', 'max:100'],
            'order_date' => ['nullable', 'date'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'promo_id' => ['nullable', 'exists:promotions,id'],
            // Tujuan order: HO atau Distributor (dipilih salesman)
            'destination' => ['nullable', Rule::in(['HO', 'DISTRIBUTOR'])],
            'distributor_customer_id' => ['required_if:destination,DISTRIBUTOR', 'nullable', 'exists:customers,id', 'different:customer_id'],
            'notes' => ['nullable', 'string'],
            'client_uuid' => ['nullable', 'uuid'],
            'lines' => ['required', 'array', 'min:1'],

            // Produk dari master Product — wajib diisi KECUALI baris ini NPD (is_custom = true)
            'lines.*.product_id' => ['required_if:lines.*.is_custom,false', 'nullable', 'exists:products,id'],

            // Penanda baris NPD (produk baru/belum terdaftar di master Product)
            'lines.*.is_custom' => ['nullable', 'boolean'],

            // Wajib diisi kalau baris ini NPD
            'lines.*.custom_part_name' => ['required_if:lines.*.is_custom,true', 'nullable', 'string', 'max:255'],

            // Qty biasa ATAU qty Kg (dikonversi ke pcs oleh server berdasarkan gramasi kemasan)
            'lines.*.qty' => ['required_without:lines.*.qty_kg', 'nullable', 'numeric', 'gt:0'],
            'lines.*.qty_kg' => ['nullable', 'numeric', 'gt:0'],
            'lines.*.gramasi_gr' => ['nullable', 'numeric', 'gt:0'],
            'lines.*.packaging_id' => ['nullable', 'exists:product_packagings,id'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'lines.*.discount' => ['nullable', 'numeric', 'min:0'],
            'lines.*.uom' => ['nullable', 'string'],
            'lines.*.is_free_product' => ['nullable', 'boolean'],
        ]);

        // Guard tambahan: pastikan tiap baris punya salah satu — product_id ATAU custom_part_name, tidak boleh dua-duanya kosong
        foreach ($data['lines'] as $i => $line) {
            $isCustom = (bool) ($line['is_custom'] ?? false);
            $hasProduct = ! empty($line['product_id']);
            $hasCustomName = ! empty($line['custom_part_name']);

            if (! $isCustom && ! $hasProduct) {
                return ApiResponse::error(
                    "Baris ke-".($i + 1).": product_id wajib diisi untuk produk non-NPD",
                    null,
                    422
                );
            }

            if ($isCustom && ! $hasCustomName) {
                return ApiResponse::error(
                    "Baris ke-".($i + 1).": nama produk (custom_part_name) wajib diisi untuk produk NPD",
                    null,
                    422
                );
            }
        }


        // Blueprint MJU 5.2.8 (SL08 Free Product): baris Free Product harus pakai Part yang sama
        // dengan baris berbayar lain di order yang sama, dan hanya untuk produk master (bukan NPD).
        foreach ($data['lines'] as $i => $line) {
            if (empty($line['is_free_product'])) {
                continue;
            }
            if (! empty($line['is_custom'])) {
                return ApiResponse::error("Baris ke-".($i + 1).": Free Product hanya berlaku untuk produk terdaftar di master, bukan NPD", null, 422);
            }
            $hasPaidSibling = collect($data['lines'])->contains(function ($other, $j) use ($line, $i) {
                return $j !== $i
                    && empty($other['is_free_product'])
                    && empty($other['is_custom'])
                    && (string) ($other['product_id'] ?? '') === (string) ($line['product_id'] ?? '');
            });
            if (! $hasPaidSibling) {
                return ApiResponse::error("Baris ke-".($i + 1).": Free Product harus memakai Part yang sama dengan baris berbayar lain pada order ini", null, 422);
            }
        }

        // Order atas prospek hanya oleh pemilik atau sales penerima delegasi (mencegah menandai Win prospek orang lain)
        if (! empty($data['lead_id'])
            && ! app(DelegationService::class)->canOrderForLead($request->user(), Lead::findOrFail($data['lead_id']))) {
            return ApiResponse::error('Anda tidak berhak membuat order atas prospek ini', null, 403);
        }

        // Harga dan diskon ditentukan server, bukan klien: baris non-NPD memakai harga master Product, dan diskon kiriman klien diabaikan.
        // Baris NPD tetap memakai harga yang diisi sales karena produknya belum ada di master.
        foreach ($data['lines'] as $i => $line) {
            if (empty($line['is_custom'])) {
                unset($data['lines'][$i]['unit_price']);
            }
            unset($data['lines'][$i]['discount']);
        }
        unset($data['discount']);

        $header = collect($data)->except('lines')->all();
        $order = $this->salesOrderService->create($header, $data['lines'], $request->user());

        return ApiResponse::success($order, 'Order berhasil dibuat', 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $order = $this->salesOrderService->find($id);
        // Order milik orang lain dijawab "tidak ditemukan" supaya id tidak bisa ditebak
        if (! $order || ! $this->access->canAccessOwned($request->user(), $order->salesperson_id)) {
            return ApiResponse::error('Order tidak ditemukan', null, 404);
        }

        return ApiResponse::success($order);
    }

    public function tracker(Request $request, int $id): JsonResponse
    {
        $order = $this->salesOrderService->find($id);
        if (! $order || ! $this->access->canAccessOwned($request->user(), $order->salesperson_id)) {
            return ApiResponse::error('Order tidak ditemukan', null, 404);
        }

        $tracker = $this->salesOrderService->tracker($id);
        if (! $tracker) {
            return ApiResponse::error('Order tidak ditemukan', null, 404);
        }

        return ApiResponse::success($tracker);
    }
}