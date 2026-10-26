<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\StarOutletService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Star Outlet Request (Blueprint MJU 3.2.3 / MKT03). Sementara hanya admin / supervisor. */
class StarOutletController extends Controller
{
    public function __construct(private readonly StarOutletService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Star Outlet hanya dapat diakses admin atau supervisor', null, 403);
        }

        return null;
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->list($request->only(['active', 'q'])));
    }

    public function candidates(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->candidates($request->get('q')));
    }

    public function store(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $data = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'requested_by' => ['nullable', 'string', 'max:150'],
            'request_reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        return ApiResponse::success($this->service->activate($data, $request->user()), 'Star Outlet diaktifkan', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $star = $this->service->find($id);
        if (! $star) {
            return ApiResponse::error('Star Outlet tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'active' => ['sometimes', 'boolean'],
            'requested_by' => ['nullable', 'string', 'max:150'],
            'request_reference' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        return ApiResponse::success($this->service->update($star, $data, $request->user()), 'Star Outlet diperbarui');
    }
}