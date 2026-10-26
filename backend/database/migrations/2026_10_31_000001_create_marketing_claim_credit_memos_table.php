<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.11 (MKT11 Potong Tagihan): credit memo atas invoice lama distributor senilai klaim yang disetujui (satu klaim, satu credit memo). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_claim_credit_memos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_claim_id')->unique()->constrained('marketing_claims')->restrictOnDelete();
            $table->string('invoice_number', 50);                  // invoice lama yang masih terbuka dan dikreditkan
            $table->decimal('credit_value', 15, 2);                // = Nilai Klaim Disetujui
            $table->string('reference', 60);                       // kode klaim, diisi pada Reference credit memo
            $table->boolean('tax_applies')->default(false);        // dikenakan PPh
            $table->string('tax_type', 12)->nullable();            // PPH_BADAN | PPH_PRIBADI
            $table->string('credit_memo_number', 50)->nullable()->unique(); // nomor AR Credit Memo, diisi saat Check & Post
            $table->string('status', 10)->default('ENTERED');      // ENTERED | POSTED | APPLIED
            $table->foreignId('entered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('entered_at')->nullable();
            $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('posted_at')->nullable();
            $table->foreignId('applied_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('applied_at')->nullable();
            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_claim_credit_memos');
    }
};