<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Revisi functional (Okt 2026): "Jenis Feedback dihapus". Form baru tidak lagi mengirim
 * feedback_type (hasilnya ditentukan Conclusion + Reason Code), jadi kolomnya harus boleh kosong.
 * Data lama tidak diubah.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_sample_feedbacks', function (Blueprint $table) {
            $table->string('feedback_type')->nullable()->change();
        });
    }

    public function down(): void
    {
        DB::table('product_sample_feedbacks')->whereNull('feedback_type')->update(['feedback_type' => 'interest']);

        Schema::table('product_sample_feedbacks', function (Blueprint $table) {
            $table->string('feedback_type')->nullable(false)->change();
        });
    }
};