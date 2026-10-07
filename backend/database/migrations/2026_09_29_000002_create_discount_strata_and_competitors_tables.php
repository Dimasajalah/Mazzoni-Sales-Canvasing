<?php
// backend/database/migrations/2026_09_29_000002_create_discount_strata_and_competitors_tables.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Diskon strata (poin 6). Sengaja kosong sampai tim functional mengisi tier-nya.
        Schema::create('discount_strata', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->nullable()->constrained('products')->cascadeOnDelete(); // null = semua produk
            $table->decimal('min_kg', 12, 3);
            $table->decimal('max_kg', 12, 3)->nullable();       // null = tanpa batas atas
            $table->decimal('discount_percent', 5, 2);
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index(['product_id', 'active']);
        });

        // Master kompetitor (FDD 4.6): tanpa harga, hanya identitas + catatan per penawaran
        Schema::create('competitors', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('address')->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('email', 120)->nullable();
            $table->timestamps();

            $table->index('name');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('competitors');
        Schema::dropIfExists('discount_strata');
    }
};
