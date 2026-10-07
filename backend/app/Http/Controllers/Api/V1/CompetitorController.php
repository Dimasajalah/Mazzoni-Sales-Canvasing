<?php
// backend/app/Http/Controllers/Api/V1/CompetitorController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Competitor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompetitorController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return ApiResponse::success(
            Competitor::query()
                ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->get('q').'%'))
                ->orderBy('name')
                ->get()
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:120'],
        ]);

        return ApiResponse::success(Competitor::create($data), 'Kompetitor ditambahkan', 201);
    }
}
