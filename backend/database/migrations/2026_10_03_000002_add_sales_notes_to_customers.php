<?php
// backend/database/migrations/2026_10_03_000002_add_sales_notes_to_customers.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Poin 5 (hasil meeting Okt 2026): tempat catatan bebas untuk sales di detail customer. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->text('sales_notes')->nullable()->after('npwp');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('sales_notes');
        });
    }
};