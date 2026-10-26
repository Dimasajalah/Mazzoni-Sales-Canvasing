<?php
//bakend/app/Http/Controllers/Api/V1/MarketingSelloutController.php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MarketingEvent;
use App\Services\MarketingSelloutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Upload Data Sell Out (Blueprint MJU 3.2.7 / MKT07) pada program klaim. Sementara hanya admin / supervisor. */
class MarketingSelloutController extends Controller
{
    public function __construct(private readonly MarketingSelloutService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Data sell out hanya dapat diakses admin atau supervisor', null, 403);
        }

        return null;
    }

    private function program(int $id): ?MarketingEvent
    {
        $program = MarketingEvent::with('budget:id,campaign_code,name')->find($id);

        return $program && $program->isClaimProgram() ? $program : null;
    }

    public function panel(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $program = $this->program($id);

        return $program ? ApiResponse::success($this->service->panel($program)) : ApiResponse::error('Program klaim tidak ditemukan', null, 404);
    }

    /** Template baku dikirim sebagai teks (nama berkas + isi) supaya bisa diunduh lewat klien API yang memakai token login. */
    public function template(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $program = $this->program($id);

        return $program ? ApiResponse::success($this->service->templateCsv($program)) : ApiResponse::error('Program klaim tidak ditemukan', null, 404);
    }

    public function upload(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $program = $this->program($id);
        if (! $program) {
            return ApiResponse::error('Program klaim tidak ditemukan', null, 404);
        }

        $request->validate(['file' => ['required', 'file', 'max:5120', 'extensions:csv,txt']]);

        $upload = $this->service->ingest($program, $request->file('file'), $request->user());

        return ApiResponse::success(
            $this->service->summary($upload, true),
            $upload->status === 'VALID' ? 'Data sell out valid' : 'Data sell out ditolak: '.$upload->error_count.' masalah ditemukan'
        );
    }
}