<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\CustomerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function __construct(private readonly CustomerService $customerService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['q', 'salesperson_id', 'active']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->customerService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_code' => ['required', 'string', 'max:50', 'unique:customers,customer_code'],
            'name' => ['required', 'string', 'max:255'],
            'customer_group' => ['nullable', 'string'],
            'grade' => ['nullable', 'string'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'npwp' => ['nullable', 'string'],
            'credit_limit' => ['nullable', 'numeric'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'salesperson_id' => ['nullable', 'exists:users,id'],
            'active' => ['nullable', 'boolean'],
        ]);

        $customer = $this->customerService->create($data, $request->user()->id);

        return ApiResponse::success($customer, 'Customer berhasil dibuat', 201);
    }

    public function show(int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        return ApiResponse::success($customer);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'customer_code' => ['sometimes', 'string', 'max:50', 'unique:customers,customer_code,'.$customer->id],
            'name' => ['sometimes', 'string', 'max:255'],
            'customer_group' => ['nullable', 'string'],
            'grade' => ['nullable', 'string'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'npwp' => ['nullable', 'string'],
            'credit_limit' => ['nullable', 'numeric'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'salesperson_id' => ['nullable', 'exists:users,id'],
            'active' => ['nullable', 'boolean'],
        ]);

        return ApiResponse::success(
            $this->customerService->update($customer, $data, $request->user()->id),
            'Customer diperbarui'
        );
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        $this->customerService->delete($customer, $request->user()->id);

        return ApiResponse::success(null, 'Customer dihapus');
    }
}
