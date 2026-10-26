<?php
//backend/app/Http/Controllers/Api/V1/ReturnController.php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\AccessPolicy;
use App\Services\ReturnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReturnController extends Controller
{
    public function __construct(
        private readonly ReturnService $returnService,
        private readonly AccessPolicy $access
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        // Peran terbatas (mis. sales) selalu dipaksa ke retur miliknya; salesperson_id dari klien diabaikan
        $filters = $this->access->scopeFilters($request->user(), $request->only(['status', 'customer_id', 'salesperson_id']));

        return ApiResponse::success($this->returnService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'exists:customers,id'],
            'so_reference' => ['nullable', 'string'],
            'reason' => ['nullable', 'string'],
            'condition_notes' => ['nullable', 'string'],
            'client_uuid' => ['nullable', 'uuid'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.product_id' => ['required', 'exists:products,id'],
            'lines.*.qty' => ['required', 'numeric', 'gt:0'],
            'attachments' => ['required', 'array', 'min:1'],
            'attachments.*' => ['file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf'],
        ], [
            'attachments.required' => 'Foto kondisi barang wajib dilampirkan.',
            'attachments.min' => 'Minimal satu foto kondisi barang wajib dilampirkan.',
        ]);

        $files = $request->file('attachments', []) ?: [];
        $return = $this->returnService->create(
            collect($data)->except(['lines', 'attachments'])->all(),
            $data['lines'],
            $request->user(),
            is_array($files) ? $files : [$files]
        );

        return ApiResponse::success($return, 'Permintaan retur berhasil diajukan', 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $return = $this->returnService->find($id);
        // Retur milik orang lain dijawab "tidak ditemukan" supaya id tidak bisa ditebak
        if (! $return || ! $this->access->canAccessOwned($request->user(), $return->salesperson_id)) {
            return ApiResponse::error('Retur tidak ditemukan', null, 404);
        }

        // Penanda untuk layar: tombol verifikasi, setujui, dan tolak hanya tampil bila server mengizinkan
        $return->setAttribute('can_change_status', $this->access->canChangeReturnStatus($request->user()));

        return ApiResponse::success($return);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        if (! $this->access->canChangeReturnStatus($request->user())) {
            return ApiResponse::error('Peran Anda tidak dapat mengubah status retur', null, 403);
        }

        $return = $this->returnService->find($id);
        if (! $return) {
            return ApiResponse::error('Retur tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(array_keys((array) config('access.return_transitions')))],
            'notes' => ['nullable', 'string'],
        ]);

        $updated = $this->returnService->updateStatus($return, $data['status'], $request->user(), $data['notes'] ?? null);
        $updated->setAttribute('can_change_status', true); // hanya peran berwenang yang sampai di sini

        return ApiResponse::success($updated, 'Status retur diperbarui');
    }
}