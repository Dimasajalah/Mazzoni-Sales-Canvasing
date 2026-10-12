<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadPromo;
use App\Services\LeadTaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Layar 11 Promo (Customer-facing): promo yang di-Apply untuk prospek ini. */
class LeadPromoController extends Controller
{
    public function __construct(private readonly LeadTaskService $leadTasks)
    {
    }

    public function index(Request $request, int $id): JsonResponse
    {
        [$lead, $error] = $this->resolve($request, $id);
        if ($error) {
            return $error;
        }

        return ApiResponse::success(
            LeadPromo::where('lead_id', $lead->id)->orderBy('id')->get(['id', 'promo_ref', 'promo_name', 'created_at'])
        );
    }

    public function apply(Request $request, int $id): JsonResponse
    {
        [$lead, $error] = $this->resolve($request, $id);
        if ($error) {
            return $error;
        }

        $data = $request->validate([
            'promo_ref' => ['required', 'string', 'max:100'],
            'promo_name' => ['nullable', 'string', 'max:255'],
        ]);

        $promo = LeadPromo::updateOrCreate(
            ['lead_id' => $lead->id, 'promo_ref' => $data['promo_ref']],
            ['promo_name' => $data['promo_name'] ?? null, 'applied_by' => $request->user()->id],
        );

        return ApiResponse::success($promo, 'Promo dipasang untuk order berikutnya', 201);
    }

    public function remove(Request $request, int $id): JsonResponse
    {
        [$lead, $error] = $this->resolve($request, $id);
        if ($error) {
            return $error;
        }

        $data = $request->validate(['promo_ref' => ['required', 'string', 'max:100']]);
        LeadPromo::where('lead_id', $lead->id)->where('promo_ref', $data['promo_ref'])->delete();

        return ApiResponse::success(null, 'Promo dilepas');
    }

    /** @return array{0: ?Lead, 1: ?JsonResponse} */
    private function resolve(Request $request, int $id): array
    {
        $lead = Lead::find($id);
        if (! $lead) {
            return [null, ApiResponse::error('Prospek tidak ditemukan', null, 404)];
        }
        if (! $this->leadTasks->canAccessLead($request->user(), $lead)) {
            return [null, ApiResponse::error('Tidak berhak mengakses prospek ini', null, 403)];
        }

        return [$lead, null];
    }
}