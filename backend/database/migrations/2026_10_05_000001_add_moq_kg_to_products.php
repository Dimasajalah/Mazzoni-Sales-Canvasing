<?php
// backend/database/migrations/2026_10_05_000001_add_moq_kg_to_products.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poin 17 (hasil meeting Okt 2026): MOQ (Minimum Order Quantity, dalam Kg) untuk produk sample
 * custom B2B tertentu — ditegakkan di baris Quotation. Nullable: produk tanpa MOQ (mayoritas
 * produk reguler) tidak terdampak sama sekali.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->decimal('moq_kg', 10, 3)->nullable()->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('moq_kg');
        });
    }
};