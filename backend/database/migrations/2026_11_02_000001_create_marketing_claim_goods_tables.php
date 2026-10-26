<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.13 (MKT13 Barang/Reward): jenis dan jumlah barang, cek stok, requisition, shipment, issue, dan serah terima. Satu klaim, satu pencairan barang. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_claim_goods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_claim_id')->unique()->constrained('marketing_claims')->restrictOnDelete();
            $table->string('status', 12)->default('SET'); // SET | REQUISITION | READY | SHIPPED | ISSUED | HANDED_OVER

            $table->foreignId('set_by')->nullable()->constrained('users')->nullOnDelete();           // 01 Set Metode Pencairan Barang
            $table->timestamp('set_at')->nullable();

            $table->boolean('stock_available')->nullable();                                            // 02 Check Stock (warehouse Marketing)
            $table->text('stock_notes')->nullable();
            $table->foreignId('stock_checked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('stock_checked_at')->nullable();

            $table->string('requisition_number', 40)->nullable();                                      // 03 Requisition (PR01), barang siap setelah di-receipt
            $table->foreignId('requisition_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('requisition_at')->nullable();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('received_at')->nullable();

            $table->string('shipment_reason_code', 30)->nullable();                                    // 04 Misc. Shipment dengan Reason Code
            $table->foreignId('shipped_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('shipped_at')->nullable();

            $table->string('issue_reference', 60)->nullable();                                         // 05 Issue Misc. Material
            $table->foreignId('issued_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('issued_at')->nullable();

            $table->string('recipient_name', 100)->nullable();                                         // 06 Input Code Klaim & Penerima
            $table->string('reference', 160)->nullable();
            $table->foreignId('handed_over_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('handed_over_at')->nullable();
            $table->timestamps();

            $table->index('status');
        });

        Schema::create('marketing_claim_goods_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_claim_goods_id')->constrained('marketing_claim_goods')->cascadeOnDelete();
            $table->string('part_num', 50);
            $table->string('description', 120)->nullable();
            $table->decimal('qty', 15, 2);
            $table->timestamps();

            $table->unique(['marketing_claim_goods_id', 'part_num']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_claim_goods_items');
        Schema::dropIfExists('marketing_claim_goods');
    }
};