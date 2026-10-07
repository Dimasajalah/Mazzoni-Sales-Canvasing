<?php
// backend/database/migrations/2026_10_01_000001_add_status_customer_and_customer_link_to_leads.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi pipeline (hasil meeting tim functional, Okt 2026):
 *  - Satu field pipeline baru: leads.status_customer (Lead/Prospek/Brand Awareness/Sampling/
 *    Quotation/Win/Lose/Distribution), menggantikan `stage` sebagai acuan utama.
 *    `stage` dan `win_loss` TETAP ada sebagai kolom nyata (banyak kode lain — delegasi, laporan
 *    NOO, validasi order — bergantung padanya), tapi sekarang keduanya SELALU diturunkan otomatis
 *    dari status_customer lewat hook di model Lead. Jangan set stage/win_loss manual lagi.
 *  - leads.customer_id: prospek yang sudah "Tertarik" di Brand Awareness langsung dibuatkan
 *    Customer (bukan menunggu Win) — sesuai keputusan meeting, bukan asumsi awal kami.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('status_customer', 20)->default('PROSPEK')->after('win_loss');
            $table->foreignId('customer_id')->nullable()->after('salesperson_id')
                ->constrained('customers')->nullOnDelete();

            $table->index('status_customer');
        });

        // Backfill data lama: lead yang sudah WIN/LOSE ikut status itu; yang masih OPEN
        // dipetakan dari stage lama (LEAD->PROSPEK, OPPORTUNITY->SAMPLING, QUOTE->QUOTATION),
        // sesuai kesimpulan meeting bahwa brand awareness & prospek masih "bagian dari Lead"
        // dan Opportunity lama itu sudah termasuk masuk tahap Sampling.
        DB::table('leads')->where('win_loss', 'WIN')->update(['status_customer' => 'WIN']);
        DB::table('leads')->where('win_loss', 'LOSE')->update(['status_customer' => 'LOSE']);
        DB::table('leads')->where('win_loss', 'OPEN')->where('stage', 'LEAD')->update(['status_customer' => 'PROSPEK']);
        DB::table('leads')->where('win_loss', 'OPEN')->where('stage', 'OPPORTUNITY')->update(['status_customer' => 'SAMPLING']);
        DB::table('leads')->where('win_loss', 'OPEN')->where('stage', 'QUOTE')->update(['status_customer' => 'QUOTATION']);
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropConstrainedForeignId('customer_id');
            $table->dropIndex(['status_customer']);
            $table->dropColumn('status_customer');
        });
    }
};