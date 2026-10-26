<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MarketingClaim;
use App\Services\MarketingGoodsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Pencairan klaim Barang/Reward (Blueprint MJU 3.2.13 / MKT13). Dikerjakan Marketing (bawaan: role supervisor dan admin). */
class MarketingGoodsController extends Controller
{
    public function __construct(private readonly MarketingGoodsService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, (array) config('marketing.claim_goods.roles'), true)) {
            return ApiResponse::error('Pencairan barang hanya dapat diakses supervisor atau admin', null, 403);
        }

        return null;
    }

    /** Mencari klaim; mengembalikan respons galat (403 atau 404) bila tidak boleh atau tidak ada. */
    private function claimOr404(Request $request, int $id): MarketingClaim|JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return $this->service->find($id) ?? ApiResponse::error('Klaim Barang tidak ditemukan', null, 404);
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->available($request->get('q')));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimOr404($request, $id);

        return $claim instanceof JsonResponse ? $claim : ApiResponse::success($claim);
    }

    /** Langkah 01: jenis dan jumlah barang (Reward). */
    public function items(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimOr404($request, $id);
        if ($claim instanceof JsonResponse) {
            return $claim;
        }

        $data = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:'.(int) config('marketing.claim_goods.max_items', 20)],
            'items.*.part_num' => ['required', 'string', 'max:50'],
            'items.*.qty' => ['required', 'numeric', 'max:999999999999'],
            'items.*.description' => ['nullable', 'string', 'max:120'],
        ]);

        return ApiResponse::success($this->service->setItems($claim, $data['items'], $request->user()), 'Reward tersimpan');
    }

    /** Langkah 02: Check Stock. */
    public function stockCheck(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimOr404($request, $id);
        if ($claim instanceof JsonResponse) {
            return $claim;
        }

        $data = $request->validate(['available' => ['required', 'boolean'], 'notes' => ['nullable', 'string', 'max:500']]);

        return ApiResponse::success($this->service->checkStock($claim, (bool) $data['available'], $data['notes'] ?? null, $request->user()), 'Check Stock tersimpan');
    }

    /** Langkah 03: nomor Requisition (PR01). */
    public function requisition(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimOr404($request, $id);
        if ($claim instanceof JsonResponse) {
            return $claim;
        }

        $data = $request->validate(['requisition_number' => ['required', 'string', 'max:40']]);

        return ApiResponse::success($this->service->saveRequisition($claim, $data['requisition_number'], $request->user()), 'Requisition tersimpan');
    }

    /** Langkah 03: barang di-receipt. */
    public function receipt(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimOr404($request, $id);

        return $claim instanceof JsonResponse ? $claim : ApiResponse::success($this->service->confirmReceipt($claim, $request->user()), 'Barang siap');
    }

    /** Langkah 04: Misc. Shipment dengan Reason Code. */
    public function shipment(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimOr404($request, $id);
        if ($claim instanceof JsonResponse) {
            return $claim;
        }

        $data = $request->validate(['reason_code' => ['required', 'string', 'max:30']]);

        return ApiResponse::success($this->service->recordShipment($claim, $data['reason_code'], $request->user()), 'Misc. Shipment tersimpan');
    }

    /** Langkah 05: Issue Misc. Material. */
    public function issue(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimOr404($request, $id);
        if ($claim instanceof JsonResponse) {
            return $claim;
        }

        $data = $request->validate(['issue_reference' => ['required', 'string', 'max:60']]);

        return ApiResponse::success($this->service->recordIssue($claim, $data['issue_reference'], $request->user()), 'Issue Misc. Material tersimpan');
    }

    /** Langkah 06: penerima dan bukti serah terima; klaim menjadi Dicairkan. */
    public function handover(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimOr404($request, $id);
        if ($claim instanceof JsonResponse) {
            return $claim;
        }

        $data = $request->validate([
            'recipient_name' => ['required', 'string', 'max:100'],
            'files' => ['required', 'array', 'min:1', 'max:5'],
            'files.*' => ['file', 'mimes:jpg,jpeg,png,gif,webp,pdf', 'max:10240'],
        ], ['files.required' => 'Lampirkan bukti serah terima barang (foto atau PDF).', 'files.min' => 'Lampirkan bukti serah terima barang (foto atau PDF).']);

        return ApiResponse::success(
            $this->service->handOver($claim, $data['recipient_name'], $request->file('files', []), $request->user()),
            'Klaim dicairkan'
        );
    }
}