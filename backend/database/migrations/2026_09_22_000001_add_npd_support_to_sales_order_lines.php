<?php
// backend/database/migrations/2026_09_22_000001_add_npd_support_to_sales_order_lines.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_order_lines', function (Blueprint $table) {
            // product_id jadi nullable — line NPD tidak punya product_id dari master Product
            $table->foreignId('product_id')->nullable()->change();

            // Penanda baris ini produk NPD (free-text), bukan dari master Product
            $table->boolean('is_custom')->default(false)->after('product_id');

            // Nama/deskripsi produk NPD yang diketik manual oleh sales
            $table->string('custom_part_name')->nullable()->after('is_custom');

            $table->index('is_custom');
        });
    }

    public function down(): void
    {
        Schema::table('sales_order_lines', function (Blueprint $table) {
            $table->dropIndex(['is_custom']);
            $table->dropColumn(['is_custom', 'custom_part_name']);
            $table->foreignId('product_id')->nullable(false)->change();
        });
    }
};