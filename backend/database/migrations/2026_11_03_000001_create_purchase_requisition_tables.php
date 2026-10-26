<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.14 (PR01 Requisition User, Reward dan Design): header, baris, lampiran RAB/gambar, dan riwayat persetujuan. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_requisitions', function (Blueprint $table) {
            $table->id();
            $table->string('pr_no', 20)->unique();                       // PR-{tahun}-{urut}
            $table->string('category', 10);                              // REWARD | DESIGN
            $table->date('needed_date');                                 // tanggal barang dibutuhkan (01)
            $table->boolean('is_rab')->default(false);                   // termasuk RAB/Bulanan: harga purchasing diperbarui PIC Dept (04)
            $table->text('notes')->nullable();
            $table->string('status', 12)->default('DRAFT');              // DRAFT | PRICING | MANAGER | DIRECTOR | REVISION | PURCHASING | DISPATCHED
            $table->unsignedTinyInteger('approval_stage')->default(1);   // 1 Manager Dept (05), 2 Direktur (06)
            $table->unsignedTinyInteger('approval_round')->default(1);   // naik setiap kali PR direvisi lalu diajukan ulang
            $table->boolean('requires_director')->default(false);        // barang asset atau total lebih dari batas
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->foreignId('requested_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('priced_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('priced_at')->nullable();
            $table->string('dispatch_target', 20)->nullable();           // PO BOP Supplier | PO BOP Lapangan | PO RMPM Lapangan (09-11)
            $table->foreignId('dispatched_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('dispatched_at')->nullable();
            $table->timestamps();

            $table->index('status');
        });

        Schema::create('purchase_requisition_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_requisition_id')->constrained('purchase_requisitions')->cascadeOnDelete();
            $table->unsignedSmallInteger('line_no');
            $table->string('part_num', 50);
            $table->string('requested_part_num', 50)->nullable();       // kode yang diketik user bila part belum terdaftar (sebelum didaftarkan IT)
            $table->string('description', 120)->nullable();
            $table->decimal('qty', 15, 2);
            $table->decimal('unit_price', 15, 2)->nullable();
            $table->boolean('is_asset')->default(false);
            $table->boolean('part_registered')->default(true);          // false: menunggu IT melakukan Register New Part (03)
            $table->foreignId('registered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('registered_at')->nullable();
            $table->timestamps();
        });

        Schema::create('purchase_requisition_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_requisition_id')->constrained('purchase_requisitions')->cascadeOnDelete();
            $table->string('kind', 10)->default('RAB');                  // RAB atau gambar barang yang diperlukan
            $table->string('path');
            $table->string('filename');
            $table->string('mime', 100)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();
        });

        Schema::create('purchase_requisition_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_requisition_id')->constrained('purchase_requisitions')->cascadeOnDelete();
            $table->unsignedTinyInteger('round')->default(1);
            $table->unsignedTinyInteger('stage');
            $table->string('stage_label', 60)->nullable();
            $table->string('action', 10);                                // APPROVED | REJECTED
            $table->string('reason_code', 40);
            $table->text('notes')->nullable();
            $table->foreignId('acted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acted_at');
            $table->timestamps();

            $table->index(['purchase_requisition_id', 'round']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_requisition_approvals');
        Schema::dropIfExists('purchase_requisition_attachments');
        Schema::dropIfExists('purchase_requisition_lines');
        Schema::dropIfExists('purchase_requisitions');
    }
};