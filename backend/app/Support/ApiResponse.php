<?php

namespace App\Support;

use App\Helpers\ApiResponse as HelperApiResponse;
use Illuminate\Http\JsonResponse;

class ApiResponse
{
    public static function success(mixed $data = null, string $message = 'Success', int $status = 200): JsonResponse
    {
        return HelperApiResponse::success($data, $message, $status);
    }

    public static function error(string $message = 'Error', mixed $errors = null, int $status = 400): JsonResponse
    {
        return HelperApiResponse::error($message, $errors, $status);
    }
}
