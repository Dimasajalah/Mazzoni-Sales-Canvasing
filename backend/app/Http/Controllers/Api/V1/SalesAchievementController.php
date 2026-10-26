<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\SalesAchievementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Dashboard Last/Actual Achievement (Blueprint MJU 5.2.14 / SL14) dan upload data Sales Target & Achievement oleh Marketing/Admin. */
class SalesAchievementController extends Controller
{
    public function __construct(private readonly SalesAchievementService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Upload Sales Target & Achievement hanya dapat diakses admin atau supervisor', null, 403);
        }

        return null;
    }

    public function panel(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->panel());
    }

    public function template(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->templateCsv());
    }

    public function upload(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        $request->validate(['file' => ['required', 'file', 'max:5120', 'extensions:csv,txt']]);

        $upload = $this->service->ingest($request->file('file'), $request->user());

        return ApiResponse::success(
            $this->service->summary($upload, true),
            $upload->status === 'VALID' ? 'Data Sales Target & Achievement valid' : 'Data ditolak: '.$upload->error_count.' masalah ditemukan'
        );
    }

    /** Dashboard Last Achievement & Actual Achievement untuk sales yang sedang login (Home). */
    public function mine(Request $request): JsonResponse
    {
        return ApiResponse::success($this->service->dashboardFor($request->user()));
    }
}