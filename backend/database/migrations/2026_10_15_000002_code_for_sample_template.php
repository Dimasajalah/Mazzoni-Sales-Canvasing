<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Dokumen hal. 28: kode task Pemberian Sample berpola GIVESMPLn. Template Sample yang ada adalah revisi
 * pertama, jadi diberi kode GIVESMPL1 (tugas yang sudah dibuat dari template itu ikut). Penomoran
 * revisi berikutnya (GIVESMPL2, 3) menunggu master data task Sample dari tim functional.
 */
return new class extends Migration
{
    public function up(): void
    {
        $b2b = DB::table('task_sets')->where('code', 'B2B')->value('id');
        if (! $b2b) {
            return;
        }

        $templateId = DB::table('task_templates')->where('task_set_id', $b2b)->where('pipeline_step', 'sampling')->value('id');
        if (! $templateId) {
            return;
        }

        DB::table('task_templates')->where('id', $templateId)->update(['code' => 'GIVESMPL1']);
        DB::table('lead_tasks')->where('task_template_id', $templateId)->update(['code' => 'GIVESMPL1']);
    }

    public function down(): void
    {
        $b2b = DB::table('task_sets')->where('code', 'B2B')->value('id');
        $templateId = $b2b
            ? DB::table('task_templates')->where('task_set_id', $b2b)->where('pipeline_step', 'sampling')->value('id')
            : null;
        if (! $templateId) {
            return;
        }

        DB::table('task_templates')->where('id', $templateId)->update(['code' => null]);
        DB::table('lead_tasks')->where('task_template_id', $templateId)->update(['code' => null]);
    }
};