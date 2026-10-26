<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Blueprint MJU 3.2.9 (MKT09 Approval Pengajuan Program Klaim). Status klaim bertambah: SUBMITTED (menunggu konfirmasi selisih ke
 * distributor), IN_APPROVAL (tahap 1-4), AWAITING_AMOUNT (disetujui, menunggu Marketing mengisi Nilai Klaim Disetujui), APPROVED, REJECTED.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketing_claims', function (Blueprint $table) {
            $table->unsignedTinyInteger('approval_stage')->default(1);
            // Langkah 01: konfirmasi nilai selisih ke distributor (dilakukan di luar sistem, di sini hanya dicatat).
            $table->timestamp('diff_confirmed_at')->nullable();
            $table->foreignId('diff_confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('diff_confirm_notes')->nullable();
            // Langkah 06: penyesuaian nilai oleh Direktur Sales, wajib beralasan.
            $table->decimal('adjusted_amount', 15, 2)->nullable();
            $table->text('adjust_reason')->nullable();
            $table->foreignId('adjusted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('adjusted_at')->nullable();
            // Langkah 07: Marketing menetapkan Nilai Klaim Disetujui (kolom approved_amount) sebagai nilai final.
            $table->foreignId('final_confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('final_confirmed_at')->nullable();
        });

        Schema::create('marketing_claim_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_claim_id')->constrained('marketing_claims')->cascadeOnDelete();
            $table->unsignedTinyInteger('stage');
            $table->string('stage_label', 60)->nullable();
            $table->string('action', 10);                 // APPROVED | REJECTED
            $table->string('reason_code', 40);
            $table->text('notes')->nullable();
            $table->decimal('adjusted_amount', 15, 2)->nullable(); // bila Direktur Sales menyesuaikan nilai saat menyetujui
            $table->text('adjust_reason')->nullable();
            $table->foreignId('acted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acted_at');
            $table->timestamps();

            $table->index(['marketing_claim_id', 'stage']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_claim_approvals');
        Schema::table('marketing_claims', function (Blueprint $table) {
            $table->dropConstrainedForeignId('diff_confirmed_by');
            $table->dropConstrainedForeignId('adjusted_by');
            $table->dropConstrainedForeignId('final_confirmed_by');
            $table->dropColumn(['approval_stage', 'diff_confirmed_at', 'diff_confirm_notes', 'adjusted_amount', 'adjust_reason', 'adjusted_at', 'final_confirmed_at']);
        });
    }
};