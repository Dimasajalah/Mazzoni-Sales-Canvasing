<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.12 (MKT12 Transfer): rekening tujuan, pajak (PPh 21 atau PPh 23), dan konfirmasi transfer. Satu klaim, satu pencairan transfer. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_claim_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_claim_id')->unique()->constrained('marketing_claims')->restrictOnDelete();
            // Rekening tujuan dan status PKP distributor (Misc. Payment Entry, langkah 01)
            $table->string('bank_name', 60);
            $table->string('account_number', 40);
            $table->string('account_name', 100);
            $table->boolean('is_individual')->default(false);   // rekening perorangan?
            $table->boolean('is_pkp')->default(false);          // status PKP distributor
            // Tax Type (langkah 02-03)
            $table->string('tax_type', 10);                      // PPH_21 | PPH_23
            $table->decimal('tax_rate', 5, 2);
            $table->string('tax_id_type', 5)->nullable();        // NPWP | KTP (dasar PPh 21 perorangan)
            $table->string('tax_id_number', 30)->nullable();
            $table->decimal('gross_amount', 15, 2);              // = Nilai Klaim Disetujui
            $table->decimal('tax_amount', 15, 2);
            $table->decimal('net_amount', 15, 2);                // yang ditransfer
            // Konfirmasi setelah dana ditransfer (Bukti Transfer)
            $table->string('status', 12)->default('ENTERED');    // ENTERED | TRANSFERRED
            $table->string('transfer_reference', 60)->nullable()->unique();
            $table->date('transferred_on')->nullable();
            $table->foreignId('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('entered_at')->nullable();
            $table->foreignId('transferred_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('transferred_at')->nullable();
            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_claim_transfers');
    }
};