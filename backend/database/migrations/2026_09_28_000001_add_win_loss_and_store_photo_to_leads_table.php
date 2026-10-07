<?php
// backend/database/migrations/2026_09_28_000001_add_win_loss_and_store_photo_to_leads_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Sesuai FDD 4.1-4.2: Stage (Lead / Opportunity / Quote) dan Status Win/Lose
 * adalah DUA field terpisah. Status default OPEN.
 *
 * Migration ini juga merapikan nilai stage lama yang masih tersisa
 * (NEW, CONTACTED, QUALIFIED, WON, LOST) supaya tidak ada nilai yatim.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('win_loss', 10)->default('OPEN')->after('stage');
            $table->string('store_photo_path')->nullable()->after('ktp');
            $table->index('win_loss');
        });

        // LOST lama: info stage asli sudah hilang, tebakan terbaik = LEAD + LOSE
        DB::table('leads')->where('stage', 'LOST')->update(['stage' => 'LEAD', 'win_loss' => 'LOSE']);
        // WON lama: menjadi QUOTE + WIN
        DB::table('leads')->where('stage', 'WON')->update(['stage' => 'QUOTE', 'win_loss' => 'WIN']);
        DB::table('leads')->whereIn('stage', ['NEW', 'CONTACTED'])->update(['stage' => 'LEAD']);
        DB::table('leads')->where('stage', 'QUALIFIED')->update(['stage' => 'OPPORTUNITY']);
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['win_loss']);
            $table->dropColumn(['win_loss', 'store_photo_path']);
        });
    }
};
