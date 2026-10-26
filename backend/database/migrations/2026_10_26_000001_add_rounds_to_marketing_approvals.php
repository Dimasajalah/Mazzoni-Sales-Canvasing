<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.6 (MKT06): event yang ditolak direvisi lalu diajukan ulang, jadi keputusan perlu dikelompokkan per putaran. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketing_events', function (Blueprint $table) {
            $table->unsignedSmallInteger('approval_round')->default(1); // naik 1 setiap kali direvisi dan diajukan ulang
        });

        Schema::table('marketing_event_approvals', function (Blueprint $table) {
            $table->unsignedSmallInteger('round')->default(1);
            $table->string('stage_label', 60)->nullable(); // nama tahap saat keputusan diambil (riwayat tetap utuh walau konfigurasi berubah)
        });
    }

    public function down(): void
    {
        Schema::table('marketing_event_approvals', function (Blueprint $table) {
            $table->dropColumn(['round', 'stage_label']);
        });
        Schema::table('marketing_events', function (Blueprint $table) {
            $table->dropColumn('approval_round');
        });
    }
};