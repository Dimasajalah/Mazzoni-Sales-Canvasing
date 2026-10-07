<?php
// backend/database/migrations/2026_10_02_000005_add_cascading_discounts_to_quote_lines.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poin 15 (hasil meeting Okt 2026): diskon per baris jadi 4 kolom bertingkat (Disc 1-4),
 * menjawab catatan lama "aturan penggabungan menunggu konfirmasi tim functional".
 * Bertingkat berarti tiap kolom memotong dari SISA harga setelah kolom sebelumnya, bukan
 * dijumlah — mis. Disc1 10% + Disc2 5% dari harga 100.000 = 100.000 x 0,90 x 0,95 = 85.500
 * (bukan 100.000 x (1 - 15%) = 85.000). `disc_percent` lama dipertahankan (tidak dipakai form
 * baru) untuk kompatibilitas data lama; strata tetap otomatis dan ikut masuk rantai bertingkat
 * di urutan pertama (sebelum Disc 1-4).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quote_lines', function (Blueprint $table) {
            $table->decimal('disc1_percent', 5, 2)->default(0)->after('disc_percent');
            $table->decimal('disc2_percent', 5, 2)->default(0)->after('disc1_percent');
            $table->decimal('disc3_percent', 5, 2)->default(0)->after('disc2_percent');
            $table->decimal('disc4_percent', 5, 2)->default(0)->after('disc3_percent');
        });
    }

    public function down(): void
    {
        Schema::table('quote_lines', function (Blueprint $table) {
            $table->dropColumn(['disc1_percent', 'disc2_percent', 'disc3_percent', 'disc4_percent']);
        });
    }
};