<?php
//backend/app/Services/CashAdvance/StagingPettyCashDashboardSource.php
namespace App\Services\CashAdvance;

use App\Models\CashAdvanceStagingIssue;
use Illuminate\Support\Carbon;

/** Data contoh FDD/Figma (Oktober 2026) digabung dengan pengeluaran yang dicatat lewat form (cash_advance_staging_issues). */
class StagingPettyCashDashboardSource implements PettyCashDashboardSource
{
    private const SEED_MONTH = '2026-10';
    private const SEED_BALANCE = 5830000;

    /** @var array<string, array{display_name:string, icon:string, sort_order:int}> keyed Operation Type */
    private const CATEGORY_DEFS = [
        'Biaya Hotel Sales' => ['display_name' => 'Hotel', 'icon' => 'hotel', 'sort_order' => 1],
        'Biaya BBM Sales' => ['display_name' => 'Bensin', 'icon' => 'fuel', 'sort_order' => 2],
        'Biaya Makan Minum Sales' => ['display_name' => 'Makan & Minum', 'icon' => 'food', 'sort_order' => 3],
        'Biaya Tol Sales' => ['display_name' => 'Tol', 'icon' => 'toll', 'sort_order' => 4],
        'Biaya Parkir Sales' => ['display_name' => 'Parkir', 'icon' => 'parking', 'sort_order' => 5],
        'Biaya Lain-lain Sales' => ['display_name' => 'Lain-lain', 'icon' => 'other', 'sort_order' => 6],
    ];

    public function summary(string $salesId, string $month): ?array
    {
        $seedIssue = $month === self::SEED_MONTH ? 1670000 : 0;
        $seedReceipt = $month === self::SEED_MONTH ? 7500000 : 0;
        $recordedIssue = $this->issuesForMonth($salesId, $month)->sum('cash_amount');

        return [
            'cash_desk' => 'UJI MJU',
            'balance' => self::SEED_BALANCE - $recordedIssue, // saldo berjalan: contoh dikurangi yang sudah dicatat
            'total_issue' => $seedIssue + $recordedIssue,
            'total_receipt' => $seedReceipt,
        ];
    }

    public function categories(string $salesId, string $month): array
    {
        $seed = $month === self::SEED_MONTH ? $this->seedCategoryTotals() : [];
        $recorded = $this->issuesForMonth($salesId, $month)
            ->groupBy('operation_type')
            ->map(fn ($rows) => ['doc_count' => $rows->count(), 'total' => $rows->sum('cash_amount')]);

        return collect(self::CATEGORY_DEFS)->map(function ($def, $opType) use ($seed, $recorded) {
            $docCount = ($seed[$opType]['doc_count'] ?? 0) + ($recorded[$opType]['doc_count'] ?? 0);
            $total = ($seed[$opType]['total'] ?? 0) + ($recorded[$opType]['total'] ?? 0);

            return [
                'operation_type' => $opType,
                'display_name' => $def['display_name'],
                'icon' => $def['icon'],
                'sort_order' => $def['sort_order'],
                'doc_count' => $docCount,
                'total' => $total,
            ];
        })->sortBy('sort_order')->values()->all();
    }

    public function documents(string $salesId, string $month, string $direction, ?string $operationType = null): array
    {
        if ($direction === 'receipt') {
            return $month === self::SEED_MONTH
                ? [['creation_date' => '2026-10-01', 'cash_document' => 'CD-0004', 'legal_number' => 'CR-0004', 'amount' => 7500000]]
                : [];
        }

        $seed = $month === self::SEED_MONTH ? $this->seedDocs($operationType) : [];
        $recorded = $this->issuesForMonth($salesId, $month)
            ->when($operationType, fn ($q) => $q->where('operation_type', $operationType))
            ->map(fn (CashAdvanceStagingIssue $i) => [
                'creation_date' => $i->creation_date->toDateString(),
                'cash_document' => $i->cashDocumentNumber(),
                'legal_number' => null,
                'amount' => (float) $i->cash_amount,
            ])->all();

        $all = array_merge($seed, $recorded);
        usort($all, fn ($a, $b) => $b['creation_date'] <=> $a['creation_date']);

        return $all;
    }

    private function issuesForMonth(string $salesId, string $month)
    {
        [$y, $m] = explode('-', $month);

        return CashAdvanceStagingIssue::query()
            ->whereYear('creation_date', $y)
            ->whereMonth('creation_date', $m)
            ->get();
    }

    private function seedCategoryTotals(): array
    {
        return [
            'Biaya Hotel Sales' => ['doc_count' => 1, 'total' => 1169000],
            'Biaya BBM Sales' => ['doc_count' => 2, 'total' => 250000],
            'Biaya Makan Minum Sales' => ['doc_count' => 1, 'total' => 180000],
            'Biaya Tol Sales' => ['doc_count' => 1, 'total' => 46000],
            'Biaya Parkir Sales' => ['doc_count' => 1, 'total' => 25000],
            'Biaya Lain-lain Sales' => ['doc_count' => 0, 'total' => 0],
        ];
    }

    private function seedDocs(?string $operationType): array
    {
        $docs = [
            'Biaya Hotel Sales' => [
                ['creation_date' => '2026-10-15', 'cash_document' => 'CD-0002', 'legal_number' => null, 'amount' => 800000],
                ['creation_date' => '2026-10-05', 'cash_document' => 'CD-0001', 'legal_number' => null, 'amount' => 369000],
            ],
            'Biaya BBM Sales' => [
                ['creation_date' => '2026-10-15', 'cash_document' => 'CD-0004', 'legal_number' => null, 'amount' => 150000],
                ['creation_date' => '2026-10-05', 'cash_document' => 'CD-0003', 'legal_number' => null, 'amount' => 100000],
            ],
            'Biaya Makan Minum Sales' => [['creation_date' => '2026-10-15', 'cash_document' => 'CD-0005', 'legal_number' => null, 'amount' => 180000]],
            'Biaya Tol Sales' => [['creation_date' => '2026-10-15', 'cash_document' => 'CD-0006', 'legal_number' => null, 'amount' => 46000]],
            'Biaya Parkir Sales' => [['creation_date' => '2026-10-15', 'cash_document' => 'CD-0007', 'legal_number' => null, 'amount' => 25000]],
        ];

        return $operationType ? ($docs[$operationType] ?? []) : array_merge(...array_values($docs));
    }
}