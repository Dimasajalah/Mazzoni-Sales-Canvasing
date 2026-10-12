<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dokumen hal. 35 (10f Add Line): baris yang ditarik dari sample yang disetujui disimpan dengan tautan ke sample-nya,
 * supaya sample itu tampil "Already on Line N" dan baris menampilkan "Pulled from Follow Up Sample N".
 * Baris manual (Add Blank Line) dibiarkan kosong, jadi tanpa badge sample.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('quote_lines', 'product_sample_id')) {
            Schema::table('quote_lines', function (Blueprint $table) {
                $table->unsignedBigInteger('product_sample_id')->nullable()->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('quote_lines', 'product_sample_id')) {
            Schema::table('quote_lines', function (Blueprint $table) {
                $table->dropColumn('product_sample_id');
            });
        }
    }
};