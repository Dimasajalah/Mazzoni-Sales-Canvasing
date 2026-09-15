<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\LeadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    public function __construct(private readonly LeadService $leadService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['stage', 'salesperson_id', 'q']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->leadService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'business_name' => ['required', 'string', 'max:255'],
            'owner_name' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email'],
            'business_type' => ['nullable', 'string', 'max:100'],
            'npwp' => ['nullable', 'string', 'max:50'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'stage' => ['nullable', 'string'],
            'estimated_value' => ['nullable', 'numeric'],
            'register_date' => ['nullable', 'date'],
            'client_uuid' => ['nullable', 'uuid'],
            'salesperson_id' => ['nullable', 'exists:users,id'],
        ]);

        $lead = $this->leadService->create($data, $request->user());

        return ApiResponse::success($lead, 'Lead berhasil dibuat', 201);
    }

    public function show(int $id): JsonResponse
    {
        $lead = $this->leadService->find($id);
        if (! $lead) {
            return ApiResponse::error('Lead tidak ditemukan', null, 404);
        }

        return ApiResponse::success($lead);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $lead = $this->leadService->find($id);
        if (! $lead) {
            return ApiResponse::error('Lead tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'business_name' => ['sometimes', 'string', 'max:255'],
            'owner_name' => ['nullable', 'string', 'max:255'],
            'address' => ['nullable', 'string'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email'],
            'business_type' => ['nullable', 'string', 'max:100'],
            'npwp' => ['nullable', 'string', 'max:50'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'stage' => ['nullable', 'string'],
            'estimated_value' => ['nullable', 'numeric'],
            'notes' => ['nullable', 'string'],
        ]);

        return ApiResponse::success($this->leadService->update($lead, $data, $request->user()), 'Lead diperbarui');
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $lead = $this->leadService->find($id);
        if (! $lead) {
            return ApiResponse::error('Lead tidak ditemukan', null, 404);
        }

        $this->leadService->delete($lead, $request->user());

        return ApiResponse::success(null, 'Lead dihapus');
    }

    public function followup(Request $request, int $id): JsonResponse
    {
        $lead = $this->leadService->find($id);
        if (! $lead) {
            return ApiResponse::error('Lead tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'followup_at' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
        ]);

        return ApiResponse::success(
            $this->leadService->scheduleFollowup($lead, $data, $request->user()),
            'Follow-up dijadwalkan',
            201
        );
    }
}
