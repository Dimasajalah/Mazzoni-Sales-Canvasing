<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\PurchaseRequisition;
use App\Services\PurchaseRequisitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Requisition User, Reward dan Design (Blueprint MJU 3.2.14 / PR01). Peran tiap langkah diatur di konfigurasi `purchase_requisition`. */
class PurchaseRequisitionController extends Controller
{
    public function __construct(private readonly PurchaseRequisitionService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! $this->service->hasAccess($request->user())) {
            return ApiResponse::error('Requisition hanya dapat diakses pengguna yang berperan di proses PR01', null, 403);
        }

        return null;
    }

    /** Mencari PR yang boleh dilihat pengguna; mengembalikan respons galat (403 atau 404) bila tidak boleh atau tidak ada. */
    private function prOr404(Request $request, int $id): PurchaseRequisition|JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return $this->service->find($id, $request->user()) ?? ApiResponse::error('Requisition tidak ditemukan', null, 404);
    }

    /** Aturan isian header dan baris (langkah 01-02). */
    private function rules(): array
    {
        $max = (int) config('marketing.purchase_requisition.max_lines', 50);

        return [
            'category' => ['required', Rule::in(array_keys(config('marketing.purchase_requisition.categories')))],
            // "yesterday" memberi ruang selisih zona waktu antara server dan pengguna
            'needed_date' => ['required', 'date', 'after_or_equal:yesterday'],
            'is_rab' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
            'lines' => ['required', 'array', 'min:1', 'max:'.$max],
            'lines.*.part_num' => ['required', 'string', 'max:50'],
            'lines.*.qty' => ['required', 'numeric', 'max:999999999999'],
            'lines.*.unit_price' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'lines.*.is_asset' => ['nullable', 'boolean'],
            'lines.*.description' => ['nullable', 'string', 'max:120'],
        ];
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->list($request->user(), $request->get('scope'), $request->get('q')));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $pr = $this->prOr404($request, $id);

        return $pr instanceof JsonResponse ? $pr : ApiResponse::success($pr);
    }

    /** Langkah 01-02: header dan baris. */
    public function store(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->create($request->user(), $request->validate($this->rules())), 'Requisition tersimpan', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $pr = $this->prOr404($request, $id);
        if ($pr instanceof JsonResponse) {
            return $pr;
        }

        return ApiResponse::success($this->service->update($pr, $request->user(), $request->validate($this->rules())), 'Requisition diperbarui');
    }

    /** RAB atau gambar barang yang diperlukan (foto atau PDF). */
    public function attachments(Request $request, int $id): JsonResponse
    {
        $pr = $this->prOr404($request, $id);
        if ($pr instanceof JsonResponse) {
            return $pr;
        }

        $data = $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:5'],
            'files.*' => ['file', 'mimes:jpg,jpeg,png,gif,webp,pdf', 'max:10240'],
        ], ['files.required' => 'Pilih minimal satu berkas (foto atau PDF).', 'files.min' => 'Pilih minimal satu berkas (foto atau PDF).']);

        return ApiResponse::success($this->service->addAttachments($pr, $request->user(), $request->file('files', [])), 'Lampiran tersimpan');
    }

    public function submit(Request $request, int $id): JsonResponse
    {
        $pr = $this->prOr404($request, $id);

        return $pr instanceof JsonResponse ? $pr : ApiResponse::success($this->service->submit($pr, $request->user()), 'Requisition diajukan');
    }

    /** Langkah 03: IT mencatat kode part terdaftar untuk baris yang belum terdaftar. */
    public function registerPart(Request $request, int $id, int $lineId): JsonResponse
    {
        $pr = $this->prOr404($request, $id);
        if ($pr instanceof JsonResponse) {
            return $pr;
        }

        $data = $request->validate(['part_num' => ['required', 'string', 'max:50']]);

        return ApiResponse::success($this->service->registerPart($pr, $lineId, $data['part_num'], $request->user()), 'Part terdaftar');
    }

    /** Langkah 04: PIC Dept memperbarui harga purchasing (RAB/Bulanan). */
    public function prices(Request $request, int $id): JsonResponse
    {
        $pr = $this->prOr404($request, $id);
        if ($pr instanceof JsonResponse) {
            return $pr;
        }

        $data = $request->validate([
            'prices' => ['required', 'array', 'min:1'],
            'prices.*.line_id' => ['required', 'integer'],
            'prices.*.unit_price' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
        ]);

        return ApiResponse::success($this->service->updatePrices($pr, $data['prices'], $request->user()), 'Harga purchasing tersimpan');
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        return $this->decide($request, $id, 'APPROVE');
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        return $this->decide($request, $id, 'REJECT');
    }

    /** Langkah 05-06: Manager Dept, lalu Direktur bila barang asset atau lebih dari batas. */
    private function decide(Request $request, int $id, string $type): JsonResponse
    {
        $pr = $this->prOr404($request, $id);
        if ($pr instanceof JsonResponse) {
            return $pr;
        }

        $data = $request->validate([
            'reason_code' => ['required', Rule::in(array_keys(config("marketing.approval_reason_codes.{$type}")))],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success(
            $this->service->decide($pr, $request->user(), $type, $data['reason_code'], $data['notes'] ?? null),
            $type === 'APPROVE' ? 'Persetujuan tersimpan' : 'Requisition dikembalikan untuk revisi'
        );
    }

    /** Langkah 07: PIC Dept mengajukan ulang PR yang sudah direvisi. */
    public function resubmit(Request $request, int $id): JsonResponse
    {
        $pr = $this->prOr404($request, $id);

        return $pr instanceof JsonResponse ? $pr : ApiResponse::success($this->service->resubmit($pr, $request->user()), 'Requisition diajukan ulang');
    }

    /** Langkah 08-11: Purchasing meneruskan PR menjadi PO. */
    public function forwardToPurchasing(Request $request, int $id): JsonResponse
    {
        $pr = $this->prOr404($request, $id);
        if ($pr instanceof JsonResponse) {
            return $pr;
        }

        $data = $request->validate(['target' => ['required', 'string', 'max:20']]);

        return ApiResponse::success($this->service->dispatch($pr, $data['target'], $request->user()), 'Requisition diteruskan ke Purchasing');
    }
}