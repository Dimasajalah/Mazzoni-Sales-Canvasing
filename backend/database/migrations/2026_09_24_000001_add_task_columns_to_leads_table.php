<?php
// backend/database/migrations/2026_09_24_000001_add_task_columns_to_leads_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->foreignId('task_set_id')->nullable()->after('stage')->constrained('task_sets')->nullOnDelete();
            $table->foreignId('task_type_id')->nullable()->after('task_set_id')->constrained('task_types')->nullOnDelete();
            $table->foreignId('task_id')->nullable()->after('task_type_id')->constrained('tasks')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_id');
            $table->dropConstrainedForeignId('task_type_id');
            $table->dropConstrainedForeignId('task_set_id');
        });
    }
};