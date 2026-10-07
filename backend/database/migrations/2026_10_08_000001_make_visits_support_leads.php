<?php
// backend/database/migrations/2026_10_08_000001_make_visits_support_leads.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hasil meeting lanjutan: sales harus bisa check-in LANGSUNG ke sebuah Lead yang baru didaftarkan
 * (belum tentu sudah punya Customer — itu baru terbentuk setelah Brand Awareness dijawab
 * "Tertarik", lihat poin 12), bukan cuma ke Customer yang sudah ada. "Abis daftar [lead], ini
 * terus dia langsung check-in... dari situ dia langsung integrate semua [ke tugas Canvassing]."
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('visits', function (Blueprint $table) {
            $table->foreignId('lead_id')->nullable()->after('id')->constrained('leads')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('visits', function (Blueprint $table) {
            $table->dropConstrainedForeignId('lead_id');
            $table->foreignId('customer_id')->nullable(false)->change();
        });
    }
};