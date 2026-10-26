<?php
//backend/app/Http/Controllers/Api/V1/ExpenseController.php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Services\AccessPolicy;
use App\Services\ExpenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ExpenseController extends Controller
{
    public function __construct(
        private readonly ExpenseService $expenseService,
        private readonly AccessPolicy $access
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        // Peran terbatas (mis. sales) selalu dipaksa ke expense miliknya; salesperson_id dari klien diabaikan
        $filters = $this->access->scopeExpenseFilters($request->user(), $request->only(['status', 'salesperson_id', 'category']));

        return ApiResponse::success($this->expenseService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        // Status tidak diterima dari klien: expense baru selalu berstatus SUBMITTED
        $data = $request->validate([
            'category' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'note' => ['nullable', 'string'],
            'expense_date' => ['nullable', 'date'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'client_uuid' => ['nullable', 'uuid'],
            'attachments' => ['nullable', 'array'],
            'attachments.*' => ['file', 'max:5120', 'mimes:jpg,jpeg,png,webp,pdf'],
        ]);

        $files = $request->file('attachments', []) ?: [];
        $expense = $this->expenseService->create($data, $request->user(), is_array($files) ? $files : [$files]);

        return ApiResponse::success($expense, 'Expense berhasil dibuat', 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $expense = $this->expenseService->find($id);
        // Expense milik orang lain dijawab "tidak ditemukan" supaya id tidak bisa ditebak
        if (! $expense || ! $this->access->canAccessOwnedExpense($request->user(), $expense->salesperson_id)) {
            return ApiResponse::error('Expense tidak ditemukan', null, 404);
        }

        // Tombol yang boleh ditampilkan layar untuk pengguna ini
        $expense->setAttribute('actions', $this->access->expenseActionsFor($request->user(), $expense->status));

        return ApiResponse::success($expense);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(array_keys((array) config('access.expense_transitions')))],
            'notes' => ['nullable', 'string'],
        ]);

        if (! $this->access->canSetExpenseStatus($request->user(), $data['status'])) {
            return ApiResponse::error('Peran Anda tidak dapat mengubah expense ke status ini', null, 403);
        }

        $expense = $this->expenseService->find($id);
        if (! $expense) {
            return ApiResponse::error('Expense tidak ditemukan', null, 404);
        }

        $updated = $this->expenseService->updateStatus($expense, $data['status'], $request->user(), $data['notes'] ?? null);
        $updated->setAttribute('actions', $this->access->expenseActionsFor($request->user(), $updated->status));

        return ApiResponse::success($updated, 'Status expense diperbarui');
    }
}