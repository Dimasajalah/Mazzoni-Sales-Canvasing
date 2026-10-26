<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.4 (MKT04 Program Klaim Entry): program klaim = marketing_events dengan activity_type KLAIM. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketing_events', function (Blueprint $table) {
            $table->string('claim_type', 30)->nullable();      // Jenis Klaim (langkah 05)
            $table->string('claim_source', 10)->nullable();    // SELL_IN | SELL_OUT (langkah 06)
            $table->string('claim_basis', 30)->nullable();     // basis perhitungan (langkah 07)
            $table->decimal('claim_threshold', 15, 2)->nullable(); // ambang
            $table->decimal('claim_rate', 15, 2)->nullable();      // besaran
            $table->string('claim_rate_type', 10)->nullable();     // PERCENT | AMOUNT
            $table->date('claim_deadline')->nullable();            // batas waktu pengajuan klaim (langkah 08)
            $table->index('activity_type');
        });
    }

    public function down(): void
    {
        Schema::table('marketing_events', function (Blueprint $table) {
            $table->dropIndex(['activity_type']);
            $table->dropColumn(['claim_type', 'claim_source', 'claim_basis', 'claim_threshold', 'claim_rate', 'claim_rate_type', 'claim_deadline']);
        });
    }
};