<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.10 (MKT10 Potong Nota): pemotongan klaim yang sudah disetujui pada nota distributor. Satu klaim bisa dipotong pada banyak nota. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_claim_deductions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_claim_id')->constrained('marketing_claims')->restrictOnDelete();
            $table->string('invoice_number', 50);
            $table->date('invoice_date')->nullable();
            $table->decimal('invoice_total', 15, 2);
            $table->decimal('claim_amount_used', 15, 2);           // nilai klaim yang digunakan pada nota ini
            $table->boolean('capped_by_invoice')->default(false);  // saldo klaim >= total invoice: nilai dipakai dibatasi sebesar invoice
            $table->string('misc_charge_code', 10)->default('KLAIM');
            $table->decimal('misc_charge_amount', 15, 2);          // bernilai negatif
            $table->string('reference', 60);                       // kode klaim, diisi pada Reference Misc Charge
            $table->decimal('balance_before', 15, 2);
            $table->decimal('balance_after', 15, 2);
            $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('posted_at');
            $table->timestamps();

            $table->unique(['marketing_claim_id', 'invoice_number']); // nota yang sama tidak dipotong dua kali oleh klaim yang sama
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_claim_deductions');
    }
};