<?php
// backend/app/Http/Controllers/Concerns/RequiresManager.php

namespace App\Http\Controllers\Concerns;

use App\Helpers\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Master data (kemasan, strata, mapping kode) hanya boleh diubah admin / supervisor. */
trait RequiresManager
{
    protected function denyUnlessManager(Request $request): ?JsonResponse
    {
        if (! in_array($request->user()->role, ['admin', 'supervisor'], true)) {
            return ApiResponse::error('Hanya admin atau supervisor yang dapat mengubah master data ini', null, 403);
        }

        return null;
    }

    /** Manajemen user hanya untuk admin. */
    protected function denyUnlessAdmin(Request $request): ?JsonResponse
    {
        if ($request->user()->role !== 'admin') {
            return ApiResponse::error('Hanya admin yang dapat mengelola user', null, 403);
        }

        return null;
    }
}
