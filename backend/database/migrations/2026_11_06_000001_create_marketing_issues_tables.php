<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.17 (MKT17 Issue Miscellaneous Material): pengeluaran barang oleh Marketing beserta Remarks (nama sales atau customer dan peruntukannya). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_issues', function (Blueprint $table) {
            $table->id();
            $table->string('issue_no', 20)->unique();                     // IS-{tahun}-{urut}
            $table->string('issue_reference', 60);                        // 02 nomor dokumen Issue Misc. Material di Epicor
            $table->string('requester_name', 100)->nullable();            // peminta (langkah 01 dilakukan di luar sistem; dicatat hanya sebagai keterangan)
            $table->text('notes')->nullable();
            $table->string('status', 10)->default('ISSUED');              // ISSUED | DONE
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();

            $table->string('recipient_type', 10)->nullable();             // 03 SALES | CUSTOMER
            $table->string('recipient_name', 100)->nullable();
            $table->string('purpose', 150)->nullable();
            $table->string('remarks', 255)->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index('status');
        });

        Schema::create('marketing_issue_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_issue_id')->constrained('marketing_issues')->cascadeOnDelete();
            $table->string('part_num', 50);
            $table->string('description', 120)->nullable();
            $table->decimal('qty', 15, 2);
            $table->timestamps();

            $table->unique(['marketing_issue_id', 'part_num']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_issue_items');
        Schema::dropIfExists('marketing_issues');
    }
};