<?php
// backend/database/migrations/2026_09_22_000007_add_lead_id_to_sales_orders_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->foreignId('lead_id')->nullable()->after('customer_id')->constrained('leads')->nullOnDelete();
            $table->index('lead_id');
        });
    }

    public function down(): void
    {
        Schema::table('sales_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('lead_id');
        });
    }
};