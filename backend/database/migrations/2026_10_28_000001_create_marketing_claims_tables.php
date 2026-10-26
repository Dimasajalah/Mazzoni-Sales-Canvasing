<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.8 (MKT08 Pengajuan Program Klaim): klaim distributor atas satu program klaim yang sudah Approved. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_claims', function (Blueprint $table) {
            $table->id();
            $table->string('claim_no', 30)->unique();
            $table->foreignId('marketing_event_id')->constrained('marketing_events')->restrictOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete(); // distributor, peserta program
            $table->date('letter_received_date');                 // tanggal terima surat klaim
            $table->decimal('claimed_amount', 15, 2);             // nilai pengajuan distributor
            $table->text('notes')->nullable();
            // DRAFT | PENDING_PASS | STOPPED | CALCULATED | SUBMITTED
            $table->string('status', 20)->default('DRAFT');
            $table->boolean('is_late')->default(false);           // melewati periode klaim

            // Keputusan Direktur Sales atas klaim yang melewati periode.
            $table->string('pass_decision', 10)->nullable();      // PASSED | REFUSED
            $table->foreignId('pass_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('pass_at')->nullable();
            $table->string('pass_reason_code', 40)->nullable();
            $table->text('pass_notes')->nullable();

            // Hasil Calculate (parameter program MKT04 + data sell out atau AR invoice).
            $table->decimal('eligible_amount', 15, 2)->nullable();
            $table->decimal('difference_amount', 15, 2)->nullable(); // nilai pengajuan dikurangi nilai eligible
            $table->json('calc_detail')->nullable();
            $table->timestamp('calculated_at')->nullable();
            $table->foreignId('calculated_by')->nullable()->constrained('users')->nullOnDelete();

            $table->string('payout_method', 20)->nullable();      // POTONG_NOTA | POTONG_TAGIHAN | TRANSFER | BARANG
            $table->timestamp('submitted_at')->nullable();        // diteruskan ke approval (MKT09)
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('approved_amount', 15, 2)->nullable(); // Nilai Klaim Disetujui, diisi oleh approval (MKT09)

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['marketing_event_id', 'customer_id']);
            $table->index('status');
        });

        Schema::create('marketing_claim_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_claim_id')->constrained('marketing_claims')->cascadeOnDelete();
            $table->string('kind', 12);                           // LETTER (Surat Klaim) | WORKSHEET (Kertas Kerja)
            $table->string('path');
            $table->string('filename');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();

            $table->index('marketing_claim_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_claim_attachments');
        Schema::dropIfExists('marketing_claims');
    }
};