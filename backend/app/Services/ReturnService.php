<?php

namespace App\Services;

use App\Models\ReturnAttachment;
use App\Models\ReturnRequest;
use App\Models\ReturnRequestLine;
use App\Models\ReturnStatusHistory;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReturnService
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = ReturnRequest::query()->with(['customer', 'salesperson', 'lines.product', 'attachments']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        if (! empty($filters['customer_id'])) {
            $query->where('customer_id', $filters['customer_id']);
        }

        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        return $query->latest()->paginate($perPage);
    }

    public function find(int $id): ?ReturnRequest
    {
        return ReturnRequest::with(['customer', 'salesperson', 'lines.product', 'attachments', 'statusHistories'])->find($id);
    }

    public function create(array $data, array $lines, User $user, array $files = []): ReturnRequest
    {
        if (! empty($data['client_uuid'])) {
            $existing = ReturnRequest::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return $existing->load(['customer', 'salesperson', 'lines.product', 'attachments']);
            }
        }

        return DB::transaction(function () use ($data, $lines, $user, $files) {
            $return = ReturnRequest::create([
                'return_number' => $this->nextReturnNumber(),
                'customer_id' => $data['customer_id'],
                'salesperson_id' => $data['salesperson_id'] ?? $user->id,
                'so_reference' => $data['so_reference'] ?? null,
                'reason' => $data['reason'] ?? null,
                'condition_notes' => $data['condition_notes'] ?? null,
                'status' => $data['status'] ?? 'SUBMITTED',
                'client_uuid' => $data['client_uuid'] ?? (string) Str::uuid(),
            ]);

            foreach ($lines as $line) {
                ReturnRequestLine::create([
                    'return_request_id' => $return->id,
                    'product_id' => $line['product_id'],
                    'qty' => $line['qty'],
                ]);
            }

            ReturnStatusHistory::create([
                'return_request_id' => $return->id,
                'user_id' => $user->id,
                'from_status' => null,
                'to_status' => $return->status,
                'notes' => 'Return submitted',
            ]);

            foreach ($files as $file) {
                $this->storeAttachment($return, $file);
            }

            $this->auditLogService->log($user->id, 'return.create', ReturnRequest::class, $return->id, null, $return->toArray());

            return $return->load(['customer', 'salesperson', 'lines.product', 'attachments', 'statusHistories']);
        });
    }

    public function updateStatus(ReturnRequest $return, string $status, User $user, ?string $notes = null): ReturnRequest
    {
        return DB::transaction(function () use ($return, $status, $user, $notes) {
            $from = $return->status;
            $payload = ['status' => $status];

            if (in_array($status, ['APPROVED', 'RMA_ISSUED'], true) && ! $return->rma_number) {
                $payload['rma_number'] = $this->nextRmaNumber();
            }

            $return->update($payload);

            ReturnStatusHistory::create([
                'return_request_id' => $return->id,
                'user_id' => $user->id,
                'from_status' => $from,
                'to_status' => $status,
                'notes' => $notes,
            ]);

            return $return->fresh(['customer', 'salesperson', 'lines.product', 'attachments', 'statusHistories']);
        });
    }

    protected function storeAttachment(ReturnRequest $return, UploadedFile $file): ReturnAttachment
    {
        $path = $file->store('returns/'.$return->id, 'public');

        return ReturnAttachment::create([
            'return_request_id' => $return->id,
            'path' => $path,
            'filename' => $file->getClientOriginalName(),
            'mime' => $file->getClientMimeType(),
            'size' => $file->getSize() ?: 0,
        ]);
    }

    protected function nextReturnNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "RET-STG-{$year}-";
        $last = ReturnRequest::where('return_number', 'like', $prefix.'%')->orderByDesc('return_number')->value('return_number');
        $seq = 1;
        if ($last && preg_match('/(\d+)$/', $last, $m)) {
            $seq = ((int) $m[1]) + 1;
        }

        return $prefix . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
    }

    public function nextRmaNumber(): string
    {
        $year = now()->format('Y');
        $prefix = "RMA-STG-{$year}-";
        $last = ReturnRequest::where('rma_number', 'like', $prefix.'%')->orderByDesc('rma_number')->value('rma_number');
        $seq = 1;
        if ($last && preg_match('/(\d+)$/', $last, $m)) {
            $seq = ((int) $m[1]) + 1;
        }

        return $prefix . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
    }
}
