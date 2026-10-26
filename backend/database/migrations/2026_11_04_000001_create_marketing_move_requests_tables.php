<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Blueprint MJU 3.2.15 (MKT14 Move Inventory Request Display Support Event): barang display dipindahkan dari WH FG ke WH Marketing untuk sebuah event.
 * Kolom `type` disiapkan agar proses serupa (mis. Move Inventory Request Sample Internal) bisa memakai tabel yang sama.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_move_requests', function (Blueprint $table) {
            $table->id();
            $table->string('req_no', 20)->unique();                       // MV-{tahun}-{urut}
            $table->string('type', 20)->default('DISPLAY_EVENT');
            $table->foreignId('marketing_event_id')->constrained('marketing_events')->restrictOnDelete();
            $table->text('notes')->nullable();
            $table->string('status', 12)->default('NEW');                 // NEW | CHECKED | REQUESTED | TRANSFERRED | ISSUED | DONE
            $table->foreignId('created_by')->constrained('users')->restrictOnDelete();

            $table->text('onhand_notes')->nullable();                     // 01 Check On-Hand Part di Inventory Marketing
            $table->foreignId('onhand_checked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('onhand_checked_at')->nullable();

            $table->string('epicor_request_no', 40)->nullable()->unique(); // 02 Move Inventory Request dari WH FG ke WH Marketing
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('requested_at')->nullable();

            $table->string('pra_sj_number', 40)->nullable()->unique();     // 03 Inventory Transfer oleh Warehouse (Dokumen: Pra-SJ)
            $table->foreignId('transferred_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('transferred_at')->nullable();

            $table->string('issue_reference', 60)->nullable();            // 04 Issue Misc. Material
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('issued_at')->nullable();

            $table->string('recipient_name', 100)->nullable();            // 05 Input Penerima dan Nama Event pada Remarks
            $table->string('remarks', 255)->nullable();
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['type', 'status']);
        });

        Schema::create('marketing_move_request_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_move_request_id')->constrained('marketing_move_requests')->cascadeOnDelete();
            $table->string('part_num', 50);
            $table->string('description', 120)->nullable();
            $table->decimal('qty', 15, 2);
            $table->decimal('onhand_qty', 15, 2)->nullable();             // hasil Check On-Hand di Inventory Marketing
            $table->timestamps();

            $table->unique(['marketing_move_request_id', 'part_num']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_move_request_items');
        Schema::dropIfExists('marketing_move_requests');
    }
};