<?php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\MarketingEvent;
use App\Services\MarketingApprovalService;
use App\Services\MarketingClaimApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Program Approval Dashboard (Blueprint MJU 3.2.6 langkah 02): hanya program yang menunggu persetujuan pengguna yang sedang login. */
class MarketingApprovalController extends Controller
{
    public function __construct(
        private readonly MarketingApprovalService $approval,
        private readonly MarketingClaimApprovalService $claimApproval,
    ) {
    }

    public function pending(Request $request): JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Persetujuan marketing hanya dapat diakses admin atau supervisor', null, 403);
        }

        $items = MarketingEvent::query()
            ->with('budget:id,campaign_code,name')
            ->withCount('participants')
            ->where('status', 'PENDING_APPROVAL')
            ->orderBy('id')
            ->get()
            ->filter(fn (MarketingEvent $e) => $this->approval->canAct($e, $request->user()))
            ->values();

        foreach ($items as $item) {
            $item->setAttribute('kind', $item->isClaimProgram() ? 'KLAIM' : 'EVENT');
            $item->setAttribute('can_act', true);
            $item->setAttribute('awaiting_label', $this->approval->levelLabel($item, (int) $item->approval_stage));
        }

        // MKT09: pengajuan klaim yang menunggu konfirmasi selisih atau approval pengguna ini, dengan bentuk yang sama dengan kartu lain.
        $claims = $this->claimApproval->pendingFor($request->user())->map(fn ($c) => [
            'id' => $c->id, 'kind' => 'PENGAJUAN', 'can_act' => true,
            'description' => 'Pengajuan klaim '.$c->customer->name, 'event_code' => $c->claim_no,
            'budget_amount' => $c->claimed_amount, 'letter_received_date' => $c->letter_received_date->format('Y-m-d'),
            'awaiting_label' => $this->claimApproval->awaitingLabel($c), 'approval_round' => 1,
        ]);

        return ApiResponse::success($items->concat($claims)->values());
    }
}