<?php
// backend/app/Http/Controllers/Api/V1/TaskController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Models\Task;
use App\Models\TaskSet;
use App\Models\TaskType;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskController extends Controller
{
    public function taskSets(): JsonResponse
    {
        return ApiResponse::success(
            TaskSet::where('active', true)->orderBy('name')->get()
        );
    }

    public function taskTypes(): JsonResponse
    {
        return ApiResponse::success(
            TaskType::where('active', true)->orderBy('name')->get()
        );
    }

    /**
     * Daftar Task, opsional difilter berdasarkan Task Type (?task_type_id=).
     * Tabel Task masih kosong sampai daftar isinya dikonfirmasi tim functional.
     */
    public function tasks(Request $request): JsonResponse
    {
        $query = Task::where('active', true);

        if ($request->filled('task_type_id')) {
            $query->where('task_type_id', $request->get('task_type_id'));
        }

        return ApiResponse::success($query->orderBy('name')->get());
    }
}