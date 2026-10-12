<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dokumen hal. 28: Rev (free text) berdampingan dengan Part. Aman dijalankan ulang: kolom hanya dibuat
 * bila belum ada (versi awal migrasi identitas produk sempat membuatnya).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('product_samples', 'rev')) {
            Schema::table('product_samples', function (Blueprint $table) {
                $table->string('rev', 50)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('product_samples', 'rev')) {
            Schema::table('product_samples', function (Blueprint $table) {
                $table->dropColumn('rev');
            });
        }
    }
};