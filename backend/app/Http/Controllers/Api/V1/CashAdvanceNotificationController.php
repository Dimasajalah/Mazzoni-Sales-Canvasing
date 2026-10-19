<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\CashAdvanceNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Pemberitahuan uang muka milik pengguna yang sedang masuk. */
class CashAdvanceNotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $mine = CashAdvanceNotification::where('user_id', $request->user()->id);

        return ApiResponse::success([
            'unread' => (clone $mine)->whereNull('read_at')->count(),
            'items' => $mine->orderByDesc('apply_date')->orderByDesc('id')->limit(50)->get(),
        ]);
    }

    public function read(Request $request, int $id): JsonResponse
    {
        $notification = CashAdvanceNotification::where('user_id', $request->user()->id)->find($id);
        if (! $notification) {
            return ApiResponse::error('Pemberitahuan tidak ditemukan', null, 404);
        }

        if (! $notification->read_at) {
            $notification->update(['read_at' => now()]);
        }

        return ApiResponse::success($notification);
    }

    public function readAll(Request $request): JsonResponse
    {
        CashAdvanceNotification::where('user_id', $request->user()->id)->whereNull('read_at')->update(['read_at' => now()]);

        return ApiResponse::success(['unread' => 0]);
    }
}