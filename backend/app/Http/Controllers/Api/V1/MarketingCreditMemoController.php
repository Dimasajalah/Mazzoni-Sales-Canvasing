<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MarketingClaim;
use App\Services\MarketingCreditMemoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Potong Tagihan (Blueprint MJU 3.2.11 / MKT11). Dikerjakan Finance (bawaan: role finance dan admin). */
class MarketingCreditMemoController extends Controller
{
    public function __construct(private readonly MarketingCreditMemoService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, (array) config('marketing.credit_memo.roles'), true)) {
            return ApiResponse::error('Potong tagihan hanya dapat diakses finance atau admin', null, 403);
        }

        return null;
    }

    private function claim(int $id): ?MarketingClaim
    {
        return $this->service->find($id);
    }

    public function index(Request $request): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }

        return ApiResponse::success($this->service->available($request->get('q')));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->claim($id);

        return $claim ? ApiResponse::success($claim) : ApiResponse::error('Klaim Potong Tagihan tidak ditemukan', null, 404);
    }

    /** Credit Memo Entry (langkah 01-02): nomor invoice lama dan, bila dikenakan PPh, Tax Type. */
    public function entry(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->claim($id);
        if (! $claim) {
            return ApiResponse::error('Klaim Potong Tagihan tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'invoice_number' => ['required', 'string', 'max:50'],
            'tax_applies' => ['nullable', 'boolean'],
            'tax_type' => ['nullable', 'string', 'max:12'],
        ]);

        return ApiResponse::success($this->service->saveEntry($claim, $data, $request->user()), 'Credit memo entry tersimpan');
    }

    /** Check & Post Credit Memo (langkah 03). */
    public function post(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->claim($id);
        if (! $claim) {
            return ApiResponse::error('Klaim Potong Tagihan tidak ditemukan', null, 404);
        }

        $data = $request->validate(['credit_memo_number' => ['required', 'string', 'max:50']]);

        return ApiResponse::success($this->service->post($claim, $data['credit_memo_number'], $request->user()), 'Credit memo diposting');
    }

    /** Apply Credit Memo (langkah 04): saldo klaim berkurang. */
    public function apply(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->claim($id);
        if (! $claim) {
            return ApiResponse::error('Klaim Potong Tagihan tidak ditemukan', null, 404);
        }

        return ApiResponse::success($this->service->apply($claim, $request->user()), 'Credit memo di-apply, saldo klaim berkurang');
    }
}