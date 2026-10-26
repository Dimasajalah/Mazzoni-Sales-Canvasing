<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\MarketingClaimDeductionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Potong Nota (Blueprint MJU 3.2.10 / MKT10). Dikerjakan Sales: sales hanya melihat klaim distributor miliknya, admin dan supervisor semuanya. */
class MarketingClaimDeductionController extends Controller
{
    public function __construct(private readonly MarketingClaimDeductionService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, (array) config('marketing.claim_deduction.roles'), true)) {
            return ApiResponse::error('Potong nota hanya dapat diakses sales, supervisor, atau admin', null, 403);
        }

        return null;
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->available($request->user(), $request->get('q')));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id, $request->user());

        return $claim ? ApiResponse::success($claim) : ApiResponse::error('Klaim Potong Nota tidak ditemukan', null, 404);
    }

    /** Check & Post: memeriksa lalu memposting potongan klaim pada satu nota. */
    public function post(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id, $request->user());
        if (! $claim) {
            return ApiResponse::error('Klaim Potong Nota tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'invoice_number' => ['required', 'string', 'max:50'],
            'invoice_date' => ['nullable', 'date'],
            'invoice_total' => ['required', 'numeric', 'gt:0', 'max:9999999999999'],
            'used_amount' => ['nullable', 'numeric', 'max:9999999999999'],
        ]);

        return ApiResponse::success($this->service->post($claim, $data, $request->user()), 'Potongan nota diposting', 201);
    }
}