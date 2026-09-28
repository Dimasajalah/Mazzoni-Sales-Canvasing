<?php
// backend/app/Http/Controllers/Api/V1/ProductSampleController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\ProductSampleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductSampleController extends Controller
{
    public function __construct(private readonly ProductSampleService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['customer_id', 'lead_id', 'salesperson_id']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->service->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'exists:customers,id'],
            'lead_id' => ['nullable', 'exists:leads,id'],
            'product_name' => ['nullable', 'string', 'max:255'],
            'flavor_variant' => ['required', 'in:BBQ,Red Hot,Mayonaise'],
            'version' => ['required', 'integer', 'min:1'],
            'qty' => ['required', 'integer', 'min:1'],
            'notes' => ['nullable', 'string'],
        ]);

        $sample = $this->service->create($data, $request->user());

        return ApiResponse::success($sample, 'Pengajuan sample berhasil dicatat', 201);
    }

    public function show(int $id): JsonResponse
    {
        $sample = $this->service->find($id);
        if (! $sample) {
            return ApiResponse::error('Data sample tidak ditemukan', null, 404);
        }

        return ApiResponse::success($sample);
    }

    public function feedbackIndex(Request $request): JsonResponse
    {
        $filters = $request->only(['product_sample_id', 'customer_id', 'feedback_type']);

        return ApiResponse::success($this->service->listFeedbacks($filters, (int) $request->get('per_page', 20)));
    }

    public function feedbackStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_sample_id' => ['nullable', 'exists:product_samples,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'lead_id' => ['nullable', 'exists:leads,id'],
            'version_sample' => ['required', 'integer', 'min:1'],
            'batch_number' => ['required', 'string', 'max:100'],
            'feedback_type' => ['required', 'in:interest,not_interest,revision'],
            'revision_types' => ['nullable', 'required_if:feedback_type,revision', 'array'],
            'revision_types.*' => ['in:warna,tekstur,bau,rasa'],
            'notes' => ['nullable', 'string'],
        ]);

        $feedback = $this->service->recordFeedback($data, $request->user());

        return ApiResponse::success($feedback, 'Feedback sample berhasil dicatat', 201);
    }
}