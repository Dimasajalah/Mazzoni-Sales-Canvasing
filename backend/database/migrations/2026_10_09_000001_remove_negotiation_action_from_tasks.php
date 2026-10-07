<?php
// backend/database/migrations/2026_10_09_000001_remove_negotiation_action_from_tasks.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Revisi functional (Okt 2026): aksi "Negosiasi" dihilangkan dari tugas — termasuk tugas
 * Quotation yang sebelumnya punya aksi ['quote', 'negotiation']. Dibersihkan di template (supaya
 * tugas baru tidak membawanya) DAN di tugas yang sudah terlanjur dibuat (actions disalin saat
 * tugas dibuat, jadi tidak ikut berubah kalau cuma template yang diubah).
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['task_templates', 'lead_tasks'] as $table) {
            DB::table($table)->whereNotNull('actions')->orderBy('id')->each(function ($row) use ($table) {
                $actions = json_decode($row->actions, true);
                if (! is_array($actions) || ! in_array('negotiation', $actions, true)) {
                    return;
                }

                DB::table($table)->where('id', $row->id)->update([
                    'actions' => json_encode(array_values(array_diff($actions, ['negotiation']))),
                ]);
            });
        }
    }

    public function down(): void
    {
        // Tidak bisa dipulihkan otomatis: tidak diketahui tugas mana yang dulu punya aksi ini.
    }
};