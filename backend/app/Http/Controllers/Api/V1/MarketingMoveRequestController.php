<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MarketingMoveRequest;
use App\Services\MarketingMoveRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Move Inventory Request Display Support Event (Blueprint MJU 3.2.15 / MKT14). Marketing dan Warehouse; peran diatur di konfigurasi `move_request`. */
class MarketingMoveRequestController extends Controller
{
    public function __construct(protected readonly MarketingMoveRequestService $service)
    {
    }

    protected function deny(Request $request): ?JsonResponse
    {
        if (! $this->service->hasAccess($request->user())) {
            return ApiResponse::error('Move inventory request hanya dapat diakses Marketing atau Warehouse', null, 403);
        }

        return null;
    }

    protected function requestOr404(Request $request, int $id): MarketingMoveRequest|JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return $this->service->find($id, $request->user()) ?? ApiResponse::error('Permintaan tidak ditemukan', null, 404);
    }

    protected function rules(): array
    {
        $max = (int) config('marketing.move_request.max_items', 20);

        return [
            'event_id' => ['required', 'integer'],
            'notes' => ['nullable', 'string', 'max:500'],
            'items' => ['required', 'array', 'min:1', 'max:'.$max],
            'items.*.part_num' => ['required', 'string', 'max:50'],
            'items.*.qty' => ['required', 'numeric', 'max:999999999999'],
            'items.*.description' => ['nullable', 'string', 'max:120'],
        ];
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->list($request->user(), $request->get('q')));
    }

    /** Event yang sudah disetujui, untuk dipilih pada permintaan baru. */
    public function events(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->eventOptions());
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $r = $this->requestOr404($request, $id);

        return $r instanceof JsonResponse ? $r : ApiResponse::success($r);
    }

    public function store(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->create($request->user(), $request->validate($this->rules())), 'Permintaan tersimpan', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $r = $this->requestOr404($request, $id);
        if ($r instanceof JsonResponse) {
            return $r;
        }

        return ApiResponse::success($this->service->update($r, $request->user(), $request->validate($this->rules())), 'Permintaan diperbarui');
    }

    /** Langkah 01: hasil Check On-Hand Part di Inventory Marketing. */
    public function onhand(Request $request, int $id): JsonResponse
    {
        $r = $this->requestOr404($request, $id);
        if ($r instanceof JsonResponse) {
            return $r;
        }

        $data = $request->validate([
            'onhand' => ['required', 'array', 'min:1'],
            'onhand.*.item_id' => ['required', 'integer'],
            'onhand.*.onhand_qty' => ['required', 'numeric', 'min:0', 'max:999999999999'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success($this->service->checkOnHand($r, $request->user(), $data['onhand'], $data['notes'] ?? null), 'Check On-Hand tersimpan');
    }

    /** Langkah 02: nomor Move Inventory Request. */
    public function moveRequest(Request $request, int $id): JsonResponse
    {
        $r = $this->requestOr404($request, $id);
        if ($r instanceof JsonResponse) {
            return $r;
        }

        $data = $request->validate(['epicor_request_no' => ['required', 'string', 'max:40']]);

        return ApiResponse::success($this->service->recordRequest($r, $request->user(), $data['epicor_request_no']), 'Move Inventory Request tersimpan');
    }

    /** Langkah 03: Inventory Transfer oleh Warehouse (Pra-SJ). */
    public function transfer(Request $request, int $id): JsonResponse
    {
        $r = $this->requestOr404($request, $id);
        if ($r instanceof JsonResponse) {
            return $r;
        }

        $data = $request->validate(['pra_sj_number' => ['required', 'string', 'max:40']]);

        return ApiResponse::success($this->service->recordTransfer($r, $request->user(), $data['pra_sj_number']), 'Inventory Transfer tersimpan');
    }

    /** Langkah 04: Issue Misc. Material. */
    public function issue(Request $request, int $id): JsonResponse
    {
        $r = $this->requestOr404($request, $id);
        if ($r instanceof JsonResponse) {
            return $r;
        }

        $data = $request->validate(['issue_reference' => ['required', 'string', 'max:60']]);

        return ApiResponse::success($this->service->recordIssue($r, $request->user(), $data['issue_reference']), 'Issue Misc. Material tersimpan');
    }

    /** Langkah 05: penerima dan nama event pada Remarks. */
    public function complete(Request $request, int $id): JsonResponse
    {
        $r = $this->requestOr404($request, $id);
        if ($r instanceof JsonResponse) {
            return $r;
        }

        $data = $request->validate(['recipient_name' => ['required', 'string', 'max:100']]);

        return ApiResponse::success($this->service->complete($r, $request->user(), $data['recipient_name']), 'Permintaan selesai');
    }
}