<?php
// backend/database/migrations/2026_09_29_000003_create_quotes_tables.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Quotation (FDD 4.6): header, baris (Kg -> pcs), kompetitor, terms. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quotes', function (Blueprint $table) {
            $table->id();
            $table->string('quote_number')->unique();           // nomor staging; nomor Epicor menyusul di epicor_quote_num
            $table->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('product_sample_id')->nullable()->constrained('product_samples')->nullOnDelete();
            $table->foreignId('salesperson_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 10)->default('DRAFT');     // DRAFT / QUOTED / WON / LOST
            $table->string('currency', 10)->default('IDR');
            $table->string('customer_po', 100)->nullable();
            $table->date('entry_date');
            $table->date('due_date')->nullable();
            $table->date('expected_close_date')->nullable();
            $table->date('follow_up_date')->nullable();
            $table->date('expires_at')->nullable();
            $table->boolean('quoted')->default(false);
            $table->timestamp('quoted_at')->nullable();
            $table->text('terms')->nullable();
            $table->text('notes')->nullable();
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('discount_total', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->string('epicor_quote_num')->nullable();
            $table->string('sync_status', 20)->default('NOT_REQUIRED');
            $table->uuid('client_uuid')->nullable()->unique();
            $table->timestamps();

            $table->index('lead_id');
            $table->index('customer_id');
            $table->index('status');
        });

        Schema::create('quote_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quote_id')->constrained('quotes')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products');
            $table->string('description');
            $table->decimal('qty_kg', 12, 3);                    // jumlah order dalam Kg
            $table->foreignId('packaging_id')->nullable()->constrained('product_packagings')->nullOnDelete();
            $table->decimal('gramasi_gr', 10, 2);                // gram per pcs
            $table->unsignedBigInteger('qty_pcs');               // hasil konversi
            $table->string('uom', 10)->default('PCS');
            $table->decimal('unit_price', 15, 2);                // harga per pcs
            $table->decimal('disc_percent', 5, 2)->default(0);   // diskon manual
            $table->decimal('strata_percent', 5, 2)->default(0); // diskon strata (otomatis)
            $table->decimal('line_total', 15, 2)->default(0);
            $table->timestamps();

            $table->index('quote_id');
        });

        Schema::create('quote_competitors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quote_id')->constrained('quotes')->cascadeOnDelete();
            $table->foreignId('competitor_id')->constrained('competitors')->cascadeOnDelete();
            $table->string('comment', 250)->nullable();
            $table->timestamps();

            $table->unique(['quote_id', 'competitor_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quote_competitors');
        Schema::dropIfExists('quote_lines');
        Schema::dropIfExists('quotes');
    }
};
