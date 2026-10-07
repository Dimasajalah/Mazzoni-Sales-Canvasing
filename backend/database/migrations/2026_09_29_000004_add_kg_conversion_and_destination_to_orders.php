<?php
// backend/database/migrations/2026_09_29_000004_add_kg_conversion_and_destination_to_orders.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sales Order: qty order dalam Kg + konversi pcs + gramasi kemasan (poin 10),
 * tujuan order HO / Distributor (poin 8), dan asal Quote.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_order_lines', function (Blueprint $table) {
            $table->decimal('qty_kg', 12, 3)->nullable()->after('qty');
            $table->decimal('gramasi_gr', 10, 2)->nullable()->after('qty_kg');
            $table->unsignedBigInteger('qty_pcs')->nullable()->after('gramasi_gr');
            $table->foreignId('packaging_id')->nullable()->after('qty_pcs')->constrained('product_packagings')->nullOnDelete();
        });

        Schema::table('sales_orders', function (Blueprint $table) {
            $table->string('destination', 12)->default('HO')->after('customer_po');   // HO / DISTRIBUTOR
            $table->foreignId('distributor_customer_id')->nullable()->after('destination')->constrained('customers')->nullOnDelete();
            $table->foreignId('quote_id')->nullable()->after('lead_id')->constrained('quotes')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('quote_id');
            $table->dropConstrainedForeignId('distributor_customer_id');
            $table->dropColumn('destination');
        });

        Schema::table('sales_order_lines', function (Blueprint $table) {
            $table->dropConstrainedForeignId('packaging_id');
            $table->dropColumn(['qty_pcs', 'gramasi_gr', 'qty_kg']);
        });
    }
};
