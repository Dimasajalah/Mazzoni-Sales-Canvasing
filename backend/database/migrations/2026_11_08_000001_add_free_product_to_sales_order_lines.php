<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Blueprint MJU 5.2.8 (SL08 Free Product). Baris Free Product memakai Part yang sama dengan baris berbayar,
 * Unit Price normal, Discount kosong (nilai barang gratis tetap terbaca di order), dan sistem membentuk
 * Miscellaneous Charge berkode FREEPROD bernilai negatif (Qty x Unit Price) sehingga nilai baris jadi nol.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales_order_lines', function (Blueprint $table) {
            $table->boolean('is_free_product')->default(false)->after('discount');
            $table->string('misc_charge_code')->nullable()->after('is_free_product');
            $table->decimal('misc_charge_amount', 15, 2)->nullable()->after('misc_charge_code');
        });
    }

    public function down(): void
    {
        Schema::table('sales_order_lines', function (Blueprint $table) {
            $table->dropColumn(['is_free_product', 'misc_charge_code', 'misc_charge_amount']);
        });
    }
};