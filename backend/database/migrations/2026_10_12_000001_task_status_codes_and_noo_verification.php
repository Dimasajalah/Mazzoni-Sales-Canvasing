<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tahap 2-3 revisi functional: kolom Status task (Process/WaitCust/Hold/In Progress), Task Type
 * mengikuti dokumen (Lead engagement / Sampling / Create Quote), kode task, dan task baru
 * VRFKSNOO (Verifikasi NOO) setelah Brand Awareness.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_tasks', function (Blueprint $table) {
            $table->string('task_status', 20)->nullable()->after('conclusion');
        });
        Schema::table('task_templates', function (Blueprint $table) {
            $table->string('code', 20)->nullable()->after('seq');
        });

        foreach (['task_templates', 'lead_tasks'] as $t) {
            DB::table($t)->where('task_type', 'Kunjungan')->where('pipeline_step', 'brand_awareness')
                ->update(['task_type' => 'Lead engagement']);
            DB::table($t)->where('task_type', 'Kunjungan')->where('pipeline_step', 'sampling')
                ->update(['task_type' => 'Sampling']);
            DB::table($t)->where('task_type', 'Quote')->update(['task_type' => 'Create Quote']);
        }

        $b2b = DB::table('task_sets')->where('code', 'B2B')->value('id');
        if (! $b2b) {
            return;
        }

        foreach (['Brand Awareness' => 'BRANDAW', 'Quotation' => 'CREATEQ', 'Order' => 'QRSLT'] as $name => $code) {
            DB::table('task_templates')->where('task_set_id', $b2b)->where('name', $name)->update(['code' => $code]);
        }

        if (! DB::table('task_templates')->where('task_set_id', $b2b)->where('code', 'VRFKSNOO')->exists()) {
            $now = now();
            DB::table('task_templates')->insert([
                'task_set_id' => $b2b,
                'seq' => 15,
                'code' => 'VRFKSNOO',
                'name' => 'Verifikasi NOO',
                'task_type' => 'Lead engagement',
                'stage' => 'LEAD',
                'required_role' => 'Sales Lapangan',
                'mandatory' => false,
                'needs_schedule' => false,
                'is_closing' => false,
                'actions' => json_encode([]),
                'pipeline_step' => 'verifikasi_noo',
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('task_templates')->where('code', 'VRFKSNOO')->delete();

        foreach (['task_templates', 'lead_tasks'] as $t) {
            DB::table($t)->where('task_type', 'Lead engagement')->where('pipeline_step', 'brand_awareness')
                ->update(['task_type' => 'Kunjungan']);
            DB::table($t)->where('task_type', 'Sampling')->where('pipeline_step', 'sampling')
                ->update(['task_type' => 'Kunjungan']);
            DB::table($t)->where('task_type', 'Create Quote')->update(['task_type' => 'Quote']);
        }

        Schema::table('task_templates', function (Blueprint $table) {
            $table->dropColumn('code');
        });
        Schema::table('lead_tasks', function (Blueprint $table) {
            $table->dropColumn('task_status');
        });
    }
};