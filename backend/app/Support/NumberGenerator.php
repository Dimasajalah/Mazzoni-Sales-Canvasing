<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

class NumberGenerator
{
    public static function next(string $prefix, string $table, string $column): string
    {
        $year = now()->format('Y');
        $like = "{$prefix}-{$year}-%";

        $last = DB::table($table)
            ->where($column, 'like', $like)
            ->orderByDesc($column)
            ->value($column);

        $seq = 1;
        if ($last && preg_match('/(\d+)$/', $last, $m)) {
            $seq = ((int) $m[1]) + 1;
        }

        return sprintf('%s-%s-%06d', $prefix, $year, $seq);
    }
}
