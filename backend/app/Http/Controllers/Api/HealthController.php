<?php

namespace App\Http\Controllers\Api;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class HealthController extends Controller
{
    public function health(): JsonResponse
    {
        return ApiResponse::success([
            'status' => 'ok',
            'app' => config('app.name'),
            'env' => config('app.env'),
            'data_source' => config('canvassing.data_source'),
            'time' => now()->toIso8601String(),
        ], 'Healthy');
    }

    public function database(): JsonResponse
    {
        try {
            DB::connection()->getPdo();
            $driver = DB::connection()->getDriverName();

            return ApiResponse::success([
                'status' => 'ok',
                'driver' => $driver,
            ], 'Database connected');
        } catch (\Throwable $e) {
            return ApiResponse::error('Database connection failed', [
                'error' => $e->getMessage(),
            ], 503);
        }
    }
}
