<?php
// backend/database/migrations/2026_10_07_000001_add_revision_to_products.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poin 22 (hasil meeting Okt 2026): reformula BUKAN membuat kode part baru, tapi menaikkan
 * Revision dari kode part yang SAMA ("main revision aja pak, bukan item sampel"). Dipakai saat
 * repeat order dengan formula yang sudah diubah.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedInteger('revision')->default(1)->after('product_group');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('revision');
        });
    }
};