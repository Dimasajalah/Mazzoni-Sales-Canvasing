<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\MarketingTransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Pencairan klaim Transfer (Blueprint MJU 3.2.12 / MKT12). Dikerjakan Finance (bawaan: role finance dan admin). */
class MarketingTransferController extends Controller
{
    public function __construct(private readonly MarketingTransferService $service)
    {
    }

    private function deny(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, (array) config('marketing.transfer.roles'), true)) {
            return ApiResponse::error('Pencairan transfer hanya dapat diakses finance atau admin', null, 403);
        }

        return null;
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
        $claim = $this->service->find($id);

        return $claim ? ApiResponse::success($claim) : ApiResponse::error('Klaim Transfer tidak ditemukan', null, 404);
    }

    /** Misc. Payment Entry (langkah 01-03): rekening tujuan, status PKP, dan jenis penerima. */
    public function entry(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);
        if (! $claim) {
            return ApiResponse::error('Klaim Transfer tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'bank_name' => ['required', 'string', 'max:60'],
            'account_number' => ['required', 'string', 'max:40', 'regex:/^[0-9][0-9 \-]*$/'],
            'account_name' => ['required', 'string', 'max:100'],
            'is_individual' => ['required', 'boolean'],
            'is_pkp' => ['nullable', 'boolean'],
            'tax_id_type' => ['nullable', Rule::in(array_keys(config('marketing.transfer.tax_id_types')))],
            'tax_id_number' => ['nullable', 'string', 'max:30'],
        ], ['account_number.regex' => 'Nomor rekening hanya boleh berisi angka, spasi, dan tanda hubung.']);

        return ApiResponse::success($this->service->saveEntry($claim, $data, $request->user()), 'Misc. payment entry tersimpan');
    }

    /** Setelah dana ditransfer: nomor referensi diisi dan klaim menjadi Dicairkan. */
    public function transferred(Request $request, int $id): JsonResponse
    {
        if ($r = $this->deny($request)) {
            return $r;
        }
        $claim = $this->service->find($id);
        if (! $claim) {
            return ApiResponse::error('Klaim Transfer tidak ditemukan', null, 404);
        }

        // "tomorrow" memberi ruang selisih zona waktu antara server dan pengguna
        $data = $request->validate([
            'transfer_reference' => ['required', 'string', 'max:60'],
            'transferred_on' => ['required', 'date', 'before_or_equal:tomorrow'],
        ]);

        return ApiResponse::success(
            $this->service->markTransferred($claim, $data['transfer_reference'], $data['transferred_on'], $request->user()),
            'Klaim dicairkan'
        );
    }
}