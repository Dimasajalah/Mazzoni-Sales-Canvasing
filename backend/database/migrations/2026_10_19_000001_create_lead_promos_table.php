<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dokumen hal. 36 (11 Promo): promo yang di-Apply untuk sebuah prospek/toko, dibawa ke langkah Sales Order.
 * promo_ref = kode promo (atau id bila tanpa kode); tabel ini sengaja tidak bergantung pada skema master promo.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('lead_promos')) {
            return;
        }

        Schema::create('lead_promos', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('lead_id')->index();
            $table->string('promo_ref', 100);
            $table->string('promo_name')->nullable();
            $table->unsignedBigInteger('applied_by')->nullable();
            $table->timestamps();

            $table->unique(['lead_id', 'promo_ref']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_promos');
    }
};