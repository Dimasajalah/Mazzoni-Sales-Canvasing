<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.2 (MKT02 Pure Event Entry): event menempel ke satu Campaign (marketing_budgets). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_budget_id')->constrained('marketing_budgets')->restrictOnDelete();
            $table->unsignedInteger('event_seq'); // MktgEvntSeq: urut per Campaign
            $table->string('description', 200);   // EvntDescription
            $table->string('reference_letter_no', 100)->unique(); // Nomor Surat Komunikasi
            $table->string('activity_type', 20);  // lihat config/marketing.php
            $table->date('start_date');
            $table->date('end_date');
            $table->string('target_type', 20);    // NATIONAL | TERRITORY | CUSTOMER
            $table->json('target_territories')->nullable();
            $table->decimal('budget_amount', 15, 2); // nilai RAB
            // MKT06 (approval) nanti yang mengubah status; budget PENDING_APPROVAL dan APPROVED dihitung teralokasi.
            $table->string('status', 20)->default('PENDING_APPROVAL');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['marketing_budget_id', 'event_seq']);
            $table->index('status');
        });

        // Dokumen 02: Daftar Peserta Pure Event (snapshot saat event disimpan).
        Schema::create('marketing_event_participants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_event_id')->constrained('marketing_events')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->unique(['marketing_event_id', 'customer_id']);
        });

        // Dokumen 01: RAB dan lampiran pendukung.
        Schema::create('marketing_event_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_event_id')->constrained('marketing_events')->cascadeOnDelete();
            $table->string('path');
            $table->string('filename');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();

            $table->index('marketing_event_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_event_attachments');
        Schema::dropIfExists('marketing_event_participants');
        Schema::dropIfExists('marketing_events');
    }
};