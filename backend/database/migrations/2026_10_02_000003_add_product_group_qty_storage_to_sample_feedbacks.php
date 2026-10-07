<?php
// backend/database/migrations/2026_10_02_000003_add_product_group_qty_storage_to_sample_feedbacks.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi form Feedback Sample (poin 10, hasil meeting Okt 2026): field jadi Product Group,
 * Qty (Gram), Batch, Tempat Simpan — Batch sudah ada, tiga lainnya baru. Version Sample lama
 * TIDAK dihapus (dipertahankan opsional untuk kompatibilitas), tidak lagi diisi dari form baru.
 * Indikator kualitas (rasa/tekstur/warna/aroma, bisa pilih beberapa yang "Tidak Oke") tetap
 * dari fitur sebelumnya (revision_types) — poin 10 tidak menyebut ini berubah.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_sample_feedbacks', function (Blueprint $table) {
            $table->string('product_group')->nullable()->after('product_sample_id');
            $table->unsignedInteger('qty')->nullable()->after('product_group'); // gram
            $table->string('storage_location')->nullable()->after('batch_number');
            $table->unsignedInteger('version_sample')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('product_sample_feedbacks', function (Blueprint $table) {
            $table->dropColumn(['product_group', 'qty', 'storage_location']);
            $table->unsignedInteger('version_sample')->nullable(false)->change();
        });
    }
};