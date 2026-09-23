<?php
// backend/database/migrations/2026_09_22_000003_add_credit_hold_to_customers_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->boolean('credit_hold')->default(false)->after('credit_limit');
            $table->index('credit_hold');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex(['credit_hold']);
            $table->dropColumn('credit_hold');
        });
    }
};