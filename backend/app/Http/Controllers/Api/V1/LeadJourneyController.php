<?php
// backend/app/Http/Controllers/Api/V1/LeadJourneyController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadJourneyEntry;
use App\Services\LeadService;
use App\Services\LeadTaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Form journey per tugas (poin 2): Brand (tertarik / tidak tertarik) dan Negosiasi.
 * Field sengaja minimal sampai tim functional menetapkan isi form-nya.
 */
class LeadJourneyController extends Controller
{
    public function __construct(private readonly LeadTaskService $tasks, private readonly LeadService $leads) {}

    public function index(Request $request, int $id): JsonResponse
    {
        $lead = Lead::find($id);
        if (! $lead) {
            return ApiResponse::error('Lead tidak ditemukan', null, 404);
        }

        if (! $this->tasks->canAccessLead($request->user(), $lead)) {
            return ApiResponse::error('Tidak berhak mengakses lead ini', null, 403);
        }

        return ApiResponse::success($lead->journeyEntries()->get());
    }

    public function store(Request $request, int $id): JsonResponse
    {
        $lead = Lead::find($id);
        if (! $lead) {
            return ApiResponse::error('Lead tidak ditemukan', null, 404);
        }

        if (! $this->tasks->canAccessLead($request->user(), $lead)) {
            return ApiResponse::error('Tidak berhak mengubah lead ini', null, 403);
        }

        $data = $request->validate([
            'entry_type' => ['required', Rule::in([LeadJourneyEntry::BRAND, LeadJourneyEntry::NEGOTIATION])],
            'lead_task_id' => [
                'nullable',
                Rule::exists('lead_tasks', 'id')->where('lead_id', $lead->id),
            ],
            'decision' => ['required_if:entry_type,BRAND', 'nullable', Rule::in(['INTERESTED', 'NOT_INTERESTED'])],
            'reason' => ['nullable', 'string', 'max:500'],
            'offer' => ['required_if:entry_type,NEGOTIATION', 'nullable', 'string', 'max:1000'],
            'customer_response' => ['nullable', 'string', 'max:1000'],
            'next_action_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            // Revisi tim functional: Conclusion & Reason Code sekarang dipilih manual oleh sales
            // (lihat concludeLeadTask terpisah) -> true berarti form ini JANGAN menyimpulkan &
            // menyelesaikan tugas sendiri lagi. Default false menjaga klien lama tetap jalan.
            'manual_conclude' => ['nullable', 'boolean'],
        ]);

        $entry = LeadJourneyEntry::create([
            ...collect($data)->except('manual_conclude')->all(),
            'lead_id' => $lead->id,
            'created_by' => $request->user()->id,
        ]);

        // Tertarik/Tidak Tertarik langsung menggerakkan status_customer (poin 2 & hasil meeting):
        // Tertarik -> Customer dibuat & lanjut Sampling; Tidak Tertarik -> Lose.
        if ($data['entry_type'] === LeadJourneyEntry::BRAND) {
            $lead = $this->leads->resolveBrandAwareness(
                $lead, $data['decision'], $request->user(), $data['lead_task_id'] ?? null, $data['manual_conclude'] ?? false
            );
        }

        return ApiResponse::success(['entry' => $entry, 'lead' => $lead], 'Catatan journey tersimpan', 201);

        return ApiResponse::success($entry, 'Catatan journey tersimpan', 201);
    }
}
