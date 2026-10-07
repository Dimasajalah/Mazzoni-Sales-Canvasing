<?php
// backend/app/Http/Controllers/Api/V1/DelegationController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadDelegation;
use App\Models\User;
use App\Services\DelegationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DelegationController extends Controller
{
    public function __construct(private readonly DelegationService $delegations)
    {
    }

    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            $this->delegations->listFor($request->user(), $request->only(['direction', 'status', 'lead_id']))
        );
    }

    /** Sales Order aktif yang bisa dipilih sebagai tujuan delegasi. */
    public function targets(Request $request): JsonResponse
    {
        if (! $request->user()->canDelegate()) {
            return ApiResponse::error('Hanya Sales Dealmaker yang dapat mendelegasikan', null, 403);
        }

        return ApiResponse::success($this->delegations->targets());
    }

    public function delegate(Request $request, int $id): JsonResponse
    {
        $user = $request->user();
        if (! $user->canDelegate()) {
            return ApiResponse::error('Hanya Sales Dealmaker yang dapat mendelegasikan prospek', null, 403);
        }

        $lead = Lead::find($id);
        if (! $lead) {
            return ApiResponse::error('Prospek tidak ditemukan', null, 404);
        }

        if ($user->role === 'sales' && $lead->salesperson_id !== $user->id) {
            return ApiResponse::error('Hanya pemilik prospek yang dapat mendelegasikannya', null, 403);
        }

        $data = $request->validate([
            'to_user_id' => ['required', 'exists:users,id'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);

        $delegation = $this->delegations->delegate($lead, User::findOrFail($data['to_user_id']), $user, $data['note'] ?? null);

        return ApiResponse::success($delegation, 'Prospek didelegasikan', 201);
    }

    /** Delegasi terakhir yang berlaku untuk sebuah prospek (untuk pemilik / penerima / admin). */
    public function forLead(Request $request, int $id): JsonResponse
    {
        $lead = Lead::find($id);
        if (! $lead) {
            return ApiResponse::error('Prospek tidak ditemukan', null, 404);
        }

        $user = $request->user();
        if ($user->role === 'sales' && $lead->salesperson_id !== $user->id && ! $this->delegations->isDelegate($user, $lead)) {
            return ApiResponse::error('Tidak berhak melihat delegasi prospek ini', null, 403);
        }

        return ApiResponse::success($this->delegations->latestActive($lead));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $delegation = LeadDelegation::find($id);
        if (! $delegation) {
            return ApiResponse::error('Delegasi tidak ditemukan', null, 404);
        }

        $user = $request->user();
        $isManager = in_array($user->role, ['admin', 'supervisor'], true);
        if (! $isManager && $delegation->from_user_id !== $user->id) {
            return ApiResponse::error('Hanya pembuat delegasi yang dapat membatalkannya', null, 403);
        }

        return ApiResponse::success($this->delegations->cancel($delegation, $user), 'Delegasi dibatalkan');
    }
}
