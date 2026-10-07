<?php
// backend/database/migrations/2026_09_29_000001_create_product_packagings_and_code_mappings_tables.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Master kemasan & gramasi (poin 4, 10) dan mapping kode SKU / Customer ke sistem lain (poin 13).
 * Isi datanya disediakan Mazzoni; tabel ini hanya wadahnya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_packagings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('name', 100);                       // mis. "Sachet 20 gr"
            $table->decimal('gramasi_gr', 10, 2);              // gram per pcs
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['product_id', 'gramasi_gr']);
        });

        Schema::create('code_mappings', function (Blueprint $table) {
            $table->id();
            $table->string('entity_type', 20);                 // product | customer
            $table->unsignedBigInteger('local_id');            // id produk / customer di aplikasi
            $table->string('external_system', 20)->default('epicor');
            $table->string('external_code', 100);              // PartNum / CustID di sistem tujuan
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->unique(['entity_type', 'local_id', 'external_system']);
            $table->index(['entity_type', 'external_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('code_mappings');
        Schema::dropIfExists('product_packagings');
    }
};
