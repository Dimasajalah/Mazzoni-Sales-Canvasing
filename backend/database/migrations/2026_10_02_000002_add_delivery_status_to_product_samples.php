<?php
// backend/database/migrations/2026_10_02_000002_add_delivery_status_to_product_samples.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poin 9 (hasil meeting Okt 2026): status pemberian sample — "Menunggu pemberian sample" sampai
 * ditandai sudah diberikan oleh sales. Data lama (dibuat sebelum kolom ini ada) dianggap sudah
 * diberikan (DELIVERED), supaya tidak muncul mendadak sebagai "menunggu" di alur yang sudah lewat.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_samples', function (Blueprint $table) {
            $table->string('status', 20)->default('PENDING')->after('batch_number');
            $table->timestamp('delivered_at')->nullable()->after('status');
        });

        \Illuminate\Support\Facades\DB::table('product_samples')->update([
            'status' => 'DELIVERED',
            'delivered_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::table('product_samples', function (Blueprint $table) {
            $table->dropColumn(['status', 'delivered_at']);
        });
    }
};