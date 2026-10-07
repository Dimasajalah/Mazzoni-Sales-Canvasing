<?php
// backend/app/Http/Controllers/Api/V1/ReportController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\NooReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportController extends Controller
{
    public function __construct(private readonly NooReportService $noo)
    {
    }

    /** Laporan NOO per sales / per territory. Sales hanya melihat datanya sendiri. */
    public function noo(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'group_by' => ['nullable', Rule::in(['sales', 'territory'])],
            'salesperson_id' => ['nullable', 'integer'],
            'territory' => ['nullable', 'string', 'max:60'],
        ]);

        return ApiResponse::success($this->noo->report(
            $request->user(),
            $data['from'] ?? null,
            $data['to'] ?? null,
            $data['group_by'] ?? 'sales',
            $request->only(['salesperson_id', 'territory'])
        ));
    }
}
