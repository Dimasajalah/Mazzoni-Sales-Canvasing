<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Services\MarketingMoveRequestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Move Inventory Request Sample Internal (Blueprint MJU 3.2.16 / MKT15). Alurnya sama dengan MKT14 (display event) dengan dua perbedaan:
 * tidak terkait event, dan langkah 05 mencatat nama sales beserta peruntukannya pada Remarks.
 */
class MarketingSampleRequestController extends MarketingMoveRequestController
{
    public function __construct(MarketingMoveRequestService $service)
    {
        parent::__construct($service->forType('SAMPLE_INTERNAL'));
    }

    /** Sama dengan MKT14 tanpa event. */
    protected function rules(): array
    {
        $rules = parent::rules();
        unset($rules['event_id']);

        return $rules;
    }

    /** Langkah 05: nama sales dan peruntukannya pada Remarks. */
    public function complete(Request $request, int $id): JsonResponse
    {
        $r = $this->requestOr404($request, $id);
        if ($r instanceof JsonResponse) {
            return $r;
        }

        $data = $request->validate(['recipient_name' => ['required', 'string', 'max:100'], 'purpose' => ['required', 'string', 'max:150']]);

        return ApiResponse::success($this->service->complete($r, $request->user(), $data['recipient_name'], $data['purpose']), 'Permintaan selesai');
    }
}