<?php
// backend/app/Services/NooReportService.php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Traceability NOO (New Open Outlet) per sales dan per territory (poin 11).
 *
 * Definisi yang dipakai (asumsi, menunggu konfirmasi tim functional):
 *  - Terdaftar : lead yang didaftarkan pada periode (register_date)
 *  - NOO (Win) : lead yang berstatus Win, dihitung pada tanggal ditutup (closed_at)
 *  - Lose      : lead yang berstatus Lose pada periode
 *  - Sudah order: dari NOO di atas, yang sudah punya sales order
 * NOO selalu dihitung ke pemilik lead (yang membuka customer), meskipun order dibuat sales lain lewat delegasi.
 */
class NooReportService
{
    /**
     * @param  array{salesperson_id?:int|string, territory?:string}  $filters
     * @return array{period:array{from:string,to:string},group_by:string,rows:list<array<string,mixed>>,totals:array<string,mixed>}
     */
    public function report(User $user, ?string $from, ?string $to, string $groupBy = 'sales', array $filters = []): array
    {
        $end = $to ? Carbon::parse($to)->endOfDay() : now()->endOfDay();
        $start = $from ? Carbon::parse($from)->startOfDay() : now()->startOfMonth();

        $byTerritory = $groupBy === 'territory';
        $key = $byTerritory ? "COALESCE(leads.territory, users.territory, 'Tanpa territory')" : 'leads.salesperson_id';
        $label = $byTerritory ? $key : "COALESCE(users.name, 'Tanpa sales')";

        $registered = $this->base($user, $filters)
            ->whereBetween('leads.register_date', [$start->toDateString(), $end->toDateString()])
            ->selectRaw("$key as k, $label as label, COUNT(*) as registered")
            ->groupByRaw("$key, $label")
            ->get();

        $closed = $this->base($user, $filters)
            ->whereIn('leads.win_loss', ['WIN', 'LOSE'])
            ->whereBetween('leads.closed_at', [$start, $end])
            ->selectRaw("$key as k, $label as label,
                SUM(CASE WHEN leads.win_loss = 'WIN' THEN 1 ELSE 0 END) as won,
                SUM(CASE WHEN leads.win_loss = 'LOSE' THEN 1 ELSE 0 END) as lost,
                SUM(CASE WHEN leads.win_loss = 'WIN'
                          AND EXISTS (SELECT 1 FROM sales_orders so WHERE so.lead_id = leads.id) THEN 1 ELSE 0 END) as ordered")
            ->groupByRaw("$key, $label")
            ->get();

        $rows = [];
        foreach ($registered as $r) {
            $rows[(string) $r->k] = $this->blank((string) $r->k, (string) $r->label) + [];
            $rows[(string) $r->k]['registered'] = (int) $r->registered;
        }
        foreach ($closed as $r) {
            $k = (string) $r->k;
            $rows[$k] ??= $this->blank($k, (string) $r->label);
            $rows[$k]['won'] = (int) $r->won;
            $rows[$k]['lost'] = (int) $r->lost;
            $rows[$k]['ordered'] = (int) $r->ordered;
        }

        $rows = array_values(array_map(fn (array $row) => $this->withRate($row), $rows));
        usort($rows, fn ($a, $b) => [$b['won'], $b['registered'], $a['label']] <=> [$a['won'], $a['registered'], $b['label']]);

        $totals = $this->withRate([
            'key' => 'total',
            'label' => 'Total',
            'registered' => array_sum(array_column($rows, 'registered')),
            'won' => array_sum(array_column($rows, 'won')),
            'lost' => array_sum(array_column($rows, 'lost')),
            'ordered' => array_sum(array_column($rows, 'ordered')),
        ]);

        return [
            'period' => ['from' => $start->toDateString(), 'to' => $end->toDateString()],
            'group_by' => $byTerritory ? 'territory' : 'sales',
            'rows' => $rows,
            'totals' => $totals,
        ];
    }

    private function base(User $user, array $filters): Builder
    {
        return DB::table('leads')
            ->leftJoin('users', 'users.id', '=', 'leads.salesperson_id')
            // sales hanya melihat datanya sendiri; admin/supervisor bisa menyaring
            ->when($user->role === 'sales', fn ($q) => $q->where('leads.salesperson_id', $user->id))
            ->when($user->role !== 'sales' && ! empty($filters['salesperson_id']), fn ($q) => $q->where('leads.salesperson_id', $filters['salesperson_id']))
            ->when(! empty($filters['territory']), fn ($q) => $q->whereRaw("COALESCE(leads.territory, users.territory) = ?", [$filters['territory']]));
    }

    /** @return array<string,mixed> */
    private function blank(string $key, string $label): array
    {
        return ['key' => $key, 'label' => $label, 'registered' => 0, 'won' => 0, 'lost' => 0, 'ordered' => 0];
    }

    /** win_rate = Win / (Win + Lose) pada periode; null bila belum ada lead yang ditutup. */
    private function withRate(array $row): array
    {
        $closed = $row['won'] + $row['lost'];
        $row['win_rate'] = $closed > 0 ? round($row['won'] / $closed * 100, 1) : null;

        return $row;
    }
}
