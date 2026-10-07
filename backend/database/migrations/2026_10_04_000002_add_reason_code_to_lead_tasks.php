<?php
// backend/database/migrations/2026_10_04_000002_add_reason_code_to_lead_tasks.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poin 8 (hasil meeting Okt 2026): tiap kesimpulan tugas (Next/Win/Lose) butuh Reason Code —
 * "reason-nya itu kan cuman ada kalo win atau lose... semuanya ada pak, kalo next juga ada".
 * Daftar kodenya ada di LeadTask::REASON_CODES, dikelompokkan per jenis kesimpulan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('lead_tasks', function (Blueprint $table) {
            $table->string('reason_code')->nullable()->after('conclusion');
        });
    }

    public function down(): void
    {
        Schema::table('lead_tasks', function (Blueprint $table) {
            $table->dropColumn('reason_code');
        });
    }
};