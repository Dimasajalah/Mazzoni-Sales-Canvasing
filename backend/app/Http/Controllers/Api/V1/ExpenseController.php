<?php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\ExpenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    public function __construct(private readonly ExpenseService $expenseService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['status', 'salesperson_id', 'category']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->expenseService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'note' => ['nullable', 'string'],
            'expense_date' => ['nullable', 'date'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'client_uuid' => ['nullable', 'uuid'],
            'status' => ['nullable', 'string'],
            'attachments' => ['nullable', 'array'],
            'attachments.*' => ['file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf'],
        ]);

        $files = $request->file('attachments', []) ?: [];
        $expense = $this->expenseService->create($data, $request->user(), is_array($files) ? $files : [$files]);

        return ApiResponse::success($expense, 'Expense berhasil dibuat', 201);
    }

    public function show(int $id): JsonResponse
    {
        $expense = $this->expenseService->find($id);
        if (! $expense) {
            return ApiResponse::error('Expense tidak ditemukan', null, 404);
        }

        return ApiResponse::success($expense);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $expense = $this->expenseService->find($id);
        if (! $expense) {
            return ApiResponse::error('Expense tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'status' => ['required', 'string'],
            'notes' => ['nullable', 'string'],
        ]);

        return ApiResponse::success(
            $this->expenseService->updateStatus($expense, $data['status'], $request->user(), $data['notes'] ?? null),
            'Status expense diperbarui'
        );
    }
}
