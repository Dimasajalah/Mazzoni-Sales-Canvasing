<?php
namespace App\Services;

use App\Models\MarketingBudget;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Blueprint MJU 3.2.1 (MKT01): staff marketing mencatat Campaign berisi budget per tahun. */
class MarketingBudgetService
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function list(array $filters = []): Collection
    {
        $query = MarketingBudget::query()->with('creator:id,name');

        if (! empty($filters['fiscal_year'])) {
            $query->where('fiscal_year', (int) $filters['fiscal_year']);
        }
        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        return $query->orderByDesc('fiscal_year')->orderBy('campaign_code')->get();
    }

    public function find(int $id): ?MarketingBudget
    {
        return MarketingBudget::with('creator:id,name')->find($id);
    }

    public function create(array $data, User $user): MarketingBudget
    {
        return DB::transaction(function () use ($data, $user) {
            $budget = MarketingBudget::create([
                'campaign_code' => ! empty($data['campaign_code']) ? trim($data['campaign_code']) : $this->nextCode((int) $data['fiscal_year']),
                'name' => $data['name'],
                'fiscal_year' => $data['fiscal_year'],
                'total_budget' => $data['total_budget'],
                'allocated_amount' => 0,
                'description' => $data['description'] ?? null,
                'status' => 'ACTIVE',
                'created_by' => $user->id,
            ]);

            $this->auditLogService->log($user->id, 'marketing_budget.create', MarketingBudget::class, $budget->id, null, $budget->toArray());

            return $budget->load('creator:id,name');
        });
    }

    /** Kode Campaign dan tahun tidak bisa diubah (kode = ID Campaign di Epicor). */
    public function update(MarketingBudget $budget, array $data, User $user): MarketingBudget
    {
        if (isset($data['total_budget']) && (float) $data['total_budget'] < (float) $budget->allocated_amount) {
            throw ValidationException::withMessages([
                'total_budget' => 'Total budget tidak boleh lebih kecil dari budget yang sudah dialokasikan.',
            ]);
        }

        $old = $budget->toArray();
        $budget->update(array_intersect_key($data, array_flip(['name', 'total_budget', 'description', 'status'])));
        $this->auditLogService->log($user->id, 'marketing_budget.update', MarketingBudget::class, $budget->id, $old, $budget->fresh()->toArray());

        return $budget->fresh('creator:id,name');
    }

    protected function nextCode(int $year): string
    {
        $prefix = "BDG-{$year}-";
        $last = MarketingBudget::where('campaign_code', 'like', $prefix.'%')->orderByDesc('campaign_code')->value('campaign_code');
        $seq = 1;
        if ($last && preg_match('/(\d+)$/', $last, $m)) {
            $seq = ((int) $m[1]) + 1;
        }

        return $prefix.str_pad((string) $seq, 3, '0', STR_PAD_LEFT);
    }
}