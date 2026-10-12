<?php
//backend/database/migrations/2026_10_15_000001_add_identity_fields_to_product_samples.php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dokumen hal. 28 (08 Pemberian Sample): identitas produk dipecah menjadi Product Group -> Part ->
 * Description (mengikuti struktur Epicor), plus Qty Given bebas ("2 pcs"). Part B2B kustom diketik bebas.
 * Semua nullable agar sample lama tidak terpengaruh.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_samples', function (Blueprint $table) {
            $table->string('part', 100)->nullable();
            $table->string('description', 255)->nullable();
            $table->string('qty_given', 50)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('product_samples', function (Blueprint $table) {
            $table->dropColumn(['part', 'description', 'qty_given']);
        });
    }
};