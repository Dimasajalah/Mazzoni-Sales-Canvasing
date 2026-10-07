<?php
// backend/app/Services/ProductSampleService.php

namespace App\Services;

use App\Models\ProductSample;
use App\Models\ProductSampleFeedback;
use App\Models\User;
use App\Models\Lead;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ProductSampleService
{
    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = ProductSample::query()->with(['customer', 'lead', 'salesperson']);

        if (! empty($filters['customer_id'])) {
            $query->where('customer_id', $filters['customer_id']);
        }
        if (! empty($filters['lead_id'])) {
            $query->where('lead_id', $filters['lead_id']);
        }
        if (! empty($filters['lead_task_id'])) {
            $query->where('lead_task_id', $filters['lead_task_id']);
        }
        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        return $query->latest()->paginate($perPage);
    }

    public function find(int $id): ?ProductSample
    {
        return ProductSample::with(['customer', 'lead', 'salesperson', 'feedbacks'])->find($id);
    }

    private function withLeadCustomer(array $data): array
    {
        if (! empty($data['lead_id'])) {
            $customerId = Lead::whereKey($data['lead_id'])->value('customer_id');
            if ($customerId) {
                $data['customer_id'] = $customerId;
            }
        }

        return $data;
    }

    public function create(array $data, User $user): ProductSample
    {
        $data = $this->withLeadCustomer($data);

        return ProductSample::create([
            ...$data,
            'salesperson_id' => $data['salesperson_id'] ?? $user->id,
            'product_name' => $data['product_name'] ?? 'Sample',
        ]);
    }

    public function listFeedbacks(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = ProductSampleFeedback::query()->with(['productSample', 'customer', 'lead', 'salesperson']);

        if (! empty($filters['product_sample_id'])) {
            $query->where('product_sample_id', $filters['product_sample_id']);
        }
        if (! empty($filters['customer_id'])) {
            $query->where('customer_id', $filters['customer_id']);
        }
        if (! empty($filters['feedback_type'])) {
            $query->where('feedback_type', $filters['feedback_type']);
        }

        return $query->latest()->paginate($perPage);
    }

    public function recordFeedback(array $data, User $user): ProductSampleFeedback
    {
        $data = $this->withLeadCustomer($data);

        return ProductSampleFeedback::create([
            ...$data,
            'salesperson_id' => $data['salesperson_id'] ?? $user->id,
            'revision_types' => ! empty($data['revision_types']) ? $data['revision_types'] : null,
        ]);
    }
}
