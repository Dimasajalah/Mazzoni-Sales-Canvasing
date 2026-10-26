<?php
//backend/app/Http/Controllers/Api/V1/CashAdvanceController.php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCashAdvanceIssueRequest;
use App\Services\CashAdvance\CashDeskNotConfiguredException;
use App\Services\CashAdvance\PettyCashDashboardService;
use App\Services\CashAdvance\PettyCashIssueService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Dashboard + Catat Pengeluaran Cash Advance (FDD Sales Mobile - Cash Advance 4.4-4.8). */
class CashAdvanceController extends Controller
{
    public function __construct(
        private readonly PettyCashDashboardService $service,
        private readonly PettyCashIssueService $issueService,
    ) {
    }

    public function summary(Request $request): JsonResponse
    {
        try {
            return ApiResponse::success($this->service->summary($request->user(), $this->month($request)));
        } catch (CashDeskNotConfiguredException $e) {
            return ApiResponse::error($e->getMessage(), ['code' => 'E-01'], 422);
        }
    }

    public function categories(Request $request): JsonResponse
    {
        return ApiResponse::success($this->service->categories($request->user(), $this->month($request)));
    }

    public function documents(Request $request): JsonResponse
    {
        $data = $request->validate([
            'direction' => 'required|in:issue,receipt',
            'operation_type' => 'nullable|string',
        ]);

        return ApiResponse::success($this->service->documents(
            $request->user(),
            $this->month($request),
            $data['direction'],
            $data['operation_type'] ?? null,
        ));
    }

    public function store(StoreCashAdvanceIssueRequest $request): JsonResponse
    {
        try {
            $result = $this->issueService->save($request->user(), $request->safe()->except('photos'), $request->file('photos'));
        } catch (\InvalidArgumentException $e) {
            return ApiResponse::error($e->getMessage(), ['code' => 'E-05'], 422);
        } catch (\Throwable $e) {
            return ApiResponse::error('Pengeluaran gagal disimpan. '.$e->getMessage(), ['code' => 'E-08'], 422);
        }

        return ApiResponse::success($result, $result['attachment_failures'] ? 'Pengeluaran tersimpan, sebagian foto gagal diunggah.' : 'Pengeluaran tersimpan.');
    }

    public function uploadAttachments(Request $request, int $issue): JsonResponse
    {
        $request->validate(['photos' => 'required|array|min:1', 'photos.*' => 'file|mimes:jpg,jpeg,png|max:10240']);

        try {
            $failed = $this->issueService->retryAttachments($request->user(), $issue, $request->file('photos'));
        } catch (\RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), ['code' => 'E-11'], 422); // >3 foto
        }

        return ApiResponse::success(['attachment_failures' => $failed]);
    }

    private function month(Request $request): string
    {
        return $request->query('month') ?: now()->format('Y-m');
    }
}