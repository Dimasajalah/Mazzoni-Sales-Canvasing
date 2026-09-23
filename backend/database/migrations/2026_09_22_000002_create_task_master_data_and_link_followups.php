<?php
// backend/database/migrations/2026_09_22_000002_create_task_master_data_and_link_followups.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_sets', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('task_types', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_type_id')->constrained('task_types')->cascadeOnDelete();
            $table->string('code')->unique();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index('task_type_id');
        });

        Schema::table('lead_followups', function (Blueprint $table) {
            $table->foreignId('task_set_id')->nullable()->after('lead_id')->constrained('task_sets')->nullOnDelete();
            $table->foreignId('task_type_id')->nullable()->after('task_set_id')->constrained('task_types')->nullOnDelete();
            $table->foreignId('task_id')->nullable()->after('task_type_id')->constrained('tasks')->nullOnDelete();
        });

        // Seed nilai yang sudah dikonfirmasi tim functional
        $now = now();

        DB::table('task_sets')->insert([
            ['code' => 'B2B', 'name' => 'B2B', 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'B2C', 'name' => 'B2C', 'active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);

        DB::table('task_types')->insert([
            ['code' => 'BRAND_AWARENESS', 'name' => 'Brand Awareness', 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'SAMPLING', 'name' => 'Sampling', 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'KUNJUNGAN', 'name' => 'Kunjungan', 'active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);

        // Tabel 'tasks' sengaja dibiarkan kosong — isinya menunggu konfirmasi tim functional
    }

    public function down(): void
    {
        Schema::table('lead_followups', function (Blueprint $table) {
            $table->dropConstrainedForeignId('task_id');
            $table->dropConstrainedForeignId('task_type_id');
            $table->dropConstrainedForeignId('task_set_id');
        });

        Schema::dropIfExists('tasks');
        Schema::dropIfExists('task_types');
        Schema::dropIfExists('task_sets');
    }
};