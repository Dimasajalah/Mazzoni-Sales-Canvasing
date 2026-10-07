<?php
// backend/database/migrations/2026_09_28_000003_create_lead_journey_entries_and_link_tasks.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Form journey per tugas (poin 2):
 *  - BRAND       : keputusan tertarik / tidak tertarik
 *  - NEGOTIATION : negosiasi
 * Field dibuat minimal; tambahan field menunggu keputusan tim functional.
 * Form Sample dan Feedback Sample yang sudah ada dihubungkan ke tugas lewat lead_task_id.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('lead_journey_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->foreignId('lead_task_id')->nullable()->constrained('lead_tasks')->nullOnDelete();
            $table->string('entry_type', 20);                  // BRAND / NEGOTIATION
            $table->string('decision', 20)->nullable();        // INTERESTED / NOT_INTERESTED (BRAND)
            $table->text('reason')->nullable();                // alasan (BRAND)
            $table->text('offer')->nullable();                 // penawaran / syarat (NEGOTIATION)
            $table->text('customer_response')->nullable();     // tanggapan customer (NEGOTIATION)
            $table->date('next_action_date')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['lead_id', 'entry_type']);
        });

        Schema::table('product_samples', function (Blueprint $table) {
            $table->foreignId('lead_task_id')->nullable()->after('lead_id')->constrained('lead_tasks')->nullOnDelete();
        });

        Schema::table('product_sample_feedbacks', function (Blueprint $table) {
            $table->foreignId('lead_task_id')->nullable()->after('lead_id')->constrained('lead_tasks')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('product_sample_feedbacks', function (Blueprint $table) {
            $table->dropConstrainedForeignId('lead_task_id');
        });

        Schema::table('product_samples', function (Blueprint $table) {
            $table->dropConstrainedForeignId('lead_task_id');
        });

        Schema::dropIfExists('lead_journey_entries');
    }
};
