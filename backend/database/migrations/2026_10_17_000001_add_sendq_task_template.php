<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Dokumen hal. 32 (10 Quotation — Header): Next Task setelah CREATEQ adalah SENDQ (Send Quote). Template B2B
 * ditambah di antara Quotation (30) dan Order/QRSLT (40). Tanpa aksi khusus, jadi diselesaikan lewat halaman
 * Complete Task. Tetap di tahap QUOTE dengan pipeline_step 'quote' agar status pelanggan tidak berubah.
 */
return new class extends Migration
{
    public function up(): void
    {
        $b2b = DB::table('task_sets')->where('code', 'B2B')->value('id');
        if (! $b2b || DB::table('task_templates')->where('task_set_id', $b2b)->where('code', 'SENDQ')->exists()) {
            return;
        }

        $now = now();
        DB::table('task_templates')->insert([
            'task_set_id' => $b2b,
            'seq' => 35,
            'code' => 'SENDQ',
            'name' => 'Send Quote',
            'task_type' => 'Send Quote',
            'stage' => 'QUOTE',
            'required_role' => 'Sales Lapangan',
            'mandatory' => false,
            'needs_schedule' => false,
            'is_closing' => false,
            'actions' => json_encode([]),
            'pipeline_step' => 'quote',
            'active' => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }

    public function down(): void
    {
        DB::table('task_templates')->where('code', 'SENDQ')->delete();
    }
};