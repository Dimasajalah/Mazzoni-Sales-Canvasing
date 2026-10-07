<?php
// backend/database/migrations/2026_10_06_000001_add_product_group_to_products.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poin 18/20/21 (hasil meeting Okt 2026): produk butuh Product Group yang sama dengan yang
 * dipakai di Pengajuan Sample / Feedback Sample (poin 9 & 11), supaya saat convert Quotation ke
 * Order bisa dicek: produk di baris itu sudah "teregister" (punya epicor_part_num) atau masih
 * placeholder sample — dan kalau belum, sales tahu harus cari pengganti di product group mana.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('product_group')->nullable()->after('description');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('product_group');
        });
    }
};