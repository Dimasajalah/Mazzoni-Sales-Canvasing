<?php
//backend/app/Services/ExpenseService.php
namespace App\Services;

use App\Models\Expense;
use App\Models\ExpenseAttachment;
use App\Models\ExpenseStatusHistory;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ExpenseService
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Expense::query()->with(['salesperson', 'customer', 'attachments']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        if (! empty($filters['category'])) {
            $query->where('category', $filters['category']);
        }

        return $query->latest('expense_date')->paginate($perPage);
    }

    public function find(int $id): ?Expense
    {
        return Expense::with(['salesperson', 'customer', 'attachments', 'statusHistories'])->find($id);
    }

    public function create(array $data, User $user, array $files = []): Expense
    {
        if (! empty($data['client_uuid'])) {
            $existing = Expense::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return $existing->load(['salesperson', 'customer', 'attachments']);
            }
        }

        return DB::transaction(function () use ($data, $user, $files) {
            $expense = Expense::create([
                'expense_number' => $this->nextExpenseNumber(),
                'salesperson_id' => $data['salesperson_id'] ?? $user->id,
                'customer_id' => $data['customer_id'] ?? null,
                'category' => $data['category'],
                'amount' => $data['amount'],
                'note' => $data['note'] ?? null,
                'expense_date' => $data['expense_date'] ?? now()->toDateString(),
                'status' => $data['status'] ?? 'SUBMITTED',
                'client_uuid' => $data['client_uuid'] ?? (string) Str::uuid(),
            ]);

            ExpenseStatusHistory::create([
                'expense_id' => $expense->id,
                'user_id' => $user->id,
                'from_status' => null,
                'to_status' => $expense->status,
                'notes' => 'Expense created',
            ]);

            foreach ($files as $file) {
                $this->storeAttachment($expense, $file);
            }

            $this->auditLogService->log($user->id, 'expense.create', Expense::class, $expense->id, null, $expense->toArray());

            return $expense->load(['salesperson', 'customer', 'attachments', 'statusHistories']);
        });
    }

    /** Status hanya boleh berpindah sesuai urutan di config/access.php; baris dikunci supaya dua permintaan bersamaan tidak saling menimpa. */
    public function updateStatus(Expense $expense, string $status, User $user, ?string $notes = null): Expense
    {
        return DB::transaction(function () use ($expense, $status, $user, $notes) {
            $locked = Expense::whereKey($expense->id)->lockForUpdate()->firstOrFail();
            $from = $locked->status;

            if (! app(AccessPolicy::class)->expenseTransitionAllowed($from, $status)) {
                throw ValidationException::withMessages([
                    'status' => "Status expense tidak dapat diubah dari {$from} ke {$status}.",
                ]);
            }

            $locked->update(['status' => $status]);

            ExpenseStatusHistory::create([
                'expense_id' => $locked->id,
                'user_id' => $user->id,
                'from_status' => $from,
                'to_status' => $status,
                'notes' => $notes,
            ]);

            $this->auditLogService->log($user->id, 'expense.status', Expense::class, $locked->id, ['status' => $from], ['status' => $status]);

            return $locked->fresh(['salesperson', 'customer', 'attachments', 'statusHistories']);
        });
    }

    protected function storeAttachment(Expense $expense, UploadedFile $file): ExpenseAttachment
    {
        $path = $file->store('expenses/'.$expense->id, 'public');

        return ExpenseAttachment::create([
            'expense_id' => $expense->id,
            'path' => $path,
            'filename' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize() ?: 0,
        ]);
    }

    /** Dipanggil di dalam transaksi pembuatan expense; baris terakhir dikunci sampai transaksi selesai. */
    protected function nextExpenseNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "EXP-STG-{$year}-";
        $last = Expense::where('expense_number', 'like', $prefix.'%')->lockForUpdate()->orderByDesc('expense_number')->value('expense_number');
        $seq = 1;
        if ($last && preg_match('/(\d+)$/', $last, $m)) {
            $seq = ((int) $m[1]) + 1;
        }

        return $prefix . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
    }
}