<?php
// backend/database/migrations/2026_10_02_000004_add_payment_term_to_quotes.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poin 14 (hasil meeting Okt 2026): tambah pilihan termin pembayaran (15D/30D/45D) di Quotation.
 * Field baru, terpisah dari `terms` yang sudah ada (teks bebas syarat & ketentuan) — payment_term
 * ini pilihan terstruktur, bukan teks bebas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('quotes', function (Blueprint $table) {
            $table->string('payment_term', 10)->nullable()->after('terms');
        });
    }

    public function down(): void
    {
        Schema::table('quotes', function (Blueprint $table) {
            $table->dropColumn('payment_term');
        });
    }
};