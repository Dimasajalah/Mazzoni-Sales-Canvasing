<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MarketingIssue;
use App\Services\MarketingIssueService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Issue Miscellaneous Material (Blueprint MJU 3.2.17 / MKT17). Dikerjakan Marketing (bawaan: role supervisor dan admin). */
class MarketingIssueController extends Controller
{
    public function __construct(private readonly MarketingIssueService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! $this->service->hasAccess($request->user())) {
            return ApiResponse::error('Issue produk hanya dapat diakses Marketing', null, 403);
        }

        return null;
    }

    private function issueOr404(Request $request, int $id): MarketingIssue|JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return $this->service->find($id) ?? ApiResponse::error('Issue tidak ditemukan', null, 404);
    }

    private function rules(): array
    {
        $max = (int) config('marketing.issue_material.max_items', 20);

        return [
            'issue_reference' => ['required', 'string', 'max:60'],
            'requester_name' => ['nullable', 'string', 'max:100'],
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

    public function show(Request $request, int $id): JsonResponse
    {
        $i = $this->issueOr404($request, $id);

        return $i instanceof JsonResponse ? $i : ApiResponse::success($i);
    }

    /** Langkah 02: Issue Misc. Material dicatat (nomor dokumen dan barang). */
    public function store(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->create($request->user(), $request->validate($this->rules())), 'Issue tersimpan', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $i = $this->issueOr404($request, $id);
        if ($i instanceof JsonResponse) {
            return $i;
        }

        return ApiResponse::success($this->service->update($i, $request->user(), $request->validate($this->rules())), 'Issue diperbarui');
    }

    /** Langkah 03: nama sales atau customer beserta peruntukannya pada Remarks. */
    public function complete(Request $request, int $id): JsonResponse
    {
        $i = $this->issueOr404($request, $id);
        if ($i instanceof JsonResponse) {
            return $i;
        }

        $data = $request->validate([
            'recipient_type' => ['required', Rule::in(array_keys(config('marketing.issue_material.recipient_types')))],
            'recipient_name' => ['required', 'string', 'max:100'],
            'purpose' => ['required', 'string', 'max:150'],
        ]);

        return ApiResponse::success(
            $this->service->complete($i, $request->user(), $data['recipient_type'], $data['recipient_name'], $data['purpose']),
            'Remarks tersimpan'
        );
    }
}