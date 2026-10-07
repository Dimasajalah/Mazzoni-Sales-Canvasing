<?php
// backend/database/migrations/2026_10_02_000001_add_product_group_and_batch_to_product_samples.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi form Pengajuan Sample (poin 8, hasil meeting Okt 2026): field jadi Customer, Product
 * Group, Qty (Gram), Batch, Keterangan — menggantikan Varian Rasa (BBQ/Red Hot/Mayonaise) + Version.
 *
 * `flavor_variant` dan `version` TIDAK dihapus (data lama & laporan yang mungkin masih bergantung
 * padanya tetap aman), tapi jadi nullable karena form baru tidak lagi mengisinya.
 *
 * CATATAN: "Product Group" belum ada daftar/master resminya dari tim functional (beda dengan
 * Varian Rasa yang sudah pasti) — untuk sekarang diisi bebas (teks), menunggu konfirmasi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_samples', function (Blueprint $table) {
            $table->string('product_group')->nullable()->after('product_name');
            $table->string('batch_number')->nullable()->after('qty');
            $table->string('flavor_variant')->nullable()->change();
            $table->unsignedInteger('version')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('product_samples', function (Blueprint $table) {
            $table->dropColumn(['product_group', 'batch_number']);
            $table->string('flavor_variant')->nullable(false)->change();
            $table->unsignedInteger('version')->nullable(false)->change();
        });
    }
};