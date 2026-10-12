<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Task ID (BRANDAW, VRFKSNOO, CREATEQ, QRSLT) ditampilkan di header form task (dokumen hal. 26).
 * Kode ada di template; tugas nyata menyalinnya agar ikut terkirim di data tugas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_tasks', function (Blueprint $table) {
            $table->string('code', 20)->nullable()->after('seq');
        });

        // Tugas yang sudah ada: salin kode dari template asalnya.
        DB::table('lead_tasks')->update([
            'code' => DB::raw('(select code from task_templates where task_templates.id = lead_tasks.task_template_id)'),
        ]);
    }

    public function down(): void
    {
        Schema::table('lead_tasks', function (Blueprint $table) {
            $table->dropColumn('code');
        });
    }
};