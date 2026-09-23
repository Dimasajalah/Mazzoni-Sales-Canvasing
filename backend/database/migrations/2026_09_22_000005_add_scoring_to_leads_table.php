<?php
// backend/database/migrations/2026_09_22_000005_add_scoring_to_leads_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('scoring', 1)->nullable()->after('stage');
            $table->index('scoring');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['scoring']);
            $table->dropColumn('scoring');
        });
    }
};