<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\MarketingBudgetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Budget Marketing (Blueprint MJU 3.2.1). Sementara hanya admin / supervisor; belum ada peran khusus marketing. */
class MarketingBudgetController extends Controller
{
    public function __construct(private readonly MarketingBudgetService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Budget marketing hanya dapat diakses admin atau supervisor', null, 403);
        }

        return null;
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->list($request->only(['fiscal_year', 'status'])));
    }

    public function store(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $data = $request->validate([
            'campaign_code' => ['nullable', 'string', 'max:30', 'unique:marketing_budgets,campaign_code'],
            'name' => ['required', 'string', 'max:150'],
            'fiscal_year' => ['required', 'integer', 'between:2020,2100'],
            'total_budget' => ['required', 'numeric', 'gt:0', 'max:9999999999999'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        return ApiResponse::success($this->service->create($data, $request->user()), 'Budget marketing berhasil dibuat', 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $budget = $this->service->find($id);

        return $budget ? ApiResponse::success($budget) : ApiResponse::error('Budget marketing tidak ditemukan', null, 404);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $budget = $this->service->find($id);
        if (! $budget) {
            return ApiResponse::error('Budget marketing tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:150'],
            'total_budget' => ['sometimes', 'required', 'numeric', 'gt:0', 'max:9999999999999'],
            'description' => ['nullable', 'string', 'max:1000'],
            'status' => ['sometimes', 'in:ACTIVE,CLOSED'],
        ]);

        return ApiResponse::success($this->service->update($budget, $data, $request->user()), 'Budget marketing diperbarui');
    }
}