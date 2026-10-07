<?php
// backend/database/migrations/2026_09_28_000002_create_task_templates_and_lead_tasks_tables.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Mesin tugas (FDD 4.3): Task Set = template alur milestone per stage.
 *  - task_templates : langkah-langkah template per Task Set (B2B / B2C)
 *  - lead_tasks     : tugas nyata milik sebuah lead (hasil generate dari template)
 *
 * Template B2B diisi dari prototype. Template B2C sengaja dikosongkan sampai
 * tim functional menentukan langkahnya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_templates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_set_id')->constrained('task_sets')->cascadeOnDelete();
            $table->unsignedInteger('seq');
            $table->string('name');
            $table->string('task_type');            // Desk Call / Panggilan Telepon / Kunjungan / Meeting / Quote / Follow-up
            $table->string('stage');                // LEAD / OPPORTUNITY / QUOTE
            $table->string('required_role')->nullable();
            $table->boolean('mandatory')->default(false);
            $table->boolean('needs_schedule')->default(false);
            $table->boolean('is_closing')->default(false); // tugas penutup: hanya Win / Lose
            $table->json('actions')->nullable();    // tombol fitur: brand, sample, feedback, negotiation, quote, order
            $table->string('pipeline_step');        // prospek / lead / brand_awareness / sampling / quote
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['task_set_id', 'seq']);
        });

        Schema::create('lead_tasks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->foreignId('task_template_id')->nullable()->constrained('task_templates')->nullOnDelete();
            $table->unsignedInteger('seq');
            $table->string('name');
            $table->string('task_type');
            $table->string('stage');
            $table->string('pipeline_step');
            $table->boolean('is_closing')->default(false);
            $table->boolean('mandatory')->default(false);
            $table->json('actions')->nullable();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->date('due_date')->nullable();
            $table->string('status', 10)->default('OPEN');   // OPEN / DONE
            $table->unsignedTinyInteger('pct_complete')->default(0);
            $table->string('conclusion', 10)->nullable();    // NEXT / WIN / LOSE
            $table->text('remark')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['lead_id', 'status']);
            $table->index('assigned_to');
        });

        $this->seedB2bTemplate();
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_tasks');
        Schema::dropIfExists('task_templates');
    }

    private function seedB2bTemplate(): void
    {
        $now = now();

        $set = DB::table('task_sets')->where('code', 'B2B')->first();
        $setId = $set?->id ?? DB::table('task_sets')->insertGetId([
            'code' => 'B2B', 'name' => 'B2B', 'active' => true, 'created_at' => $now, 'updated_at' => $now,
        ]);

        // seq, nama, tipe, stage, role, perlu jadwal, penutup, actions, pipeline step
        $steps = [
            [10, 'Identifikasi & prioritas customer', 'Desk Call', 'LEAD', 'Desk Call', false, false, [], 'prospek'],
            [20, 'Hubungi & jadwalkan kunjungan', 'Panggilan Telepon', 'LEAD', 'Desk Call', false, false, [], 'lead'],
            [30, 'Kunjungan perkenalan (canvassing)', 'Kunjungan', 'OPPORTUNITY', 'Sales Lapangan', true, false, ['brand'], 'brand_awareness'],
            [40, 'Pengajuan Sample', 'Kunjungan', 'OPPORTUNITY', 'Sales Lapangan', true, false, ['sample', 'feedback'], 'sampling'],
            [50, 'Kualifikasi kebutuhan', 'Meeting', 'OPPORTUNITY', 'Sales Lapangan', false, false, ['negotiation'], 'sampling'],
            [60, 'Susun Quotation (quote)', 'Quote', 'QUOTE', 'Sales Lapangan', true, false, ['quote'], 'quote'],
            [70, 'Follow-up Quotation & closing', 'Follow-up', 'QUOTE', 'Sales Lapangan', false, true, ['order'], 'quote'],
        ];

        foreach ($steps as [$seq, $name, $type, $stage, $role, $needsSchedule, $closing, $actions, $step]) {
            DB::table('task_templates')->insert([
                'task_set_id' => $setId,
                'seq' => $seq,
                'name' => $name,
                'task_type' => $type,
                'stage' => $stage,
                'required_role' => $role,
                'mandatory' => false,
                'needs_schedule' => $needsSchedule,
                'is_closing' => $closing,
                'actions' => json_encode($actions),
                'pipeline_step' => $step,
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
};
