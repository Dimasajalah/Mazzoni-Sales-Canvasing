<?php
// backend/database/migrations/2026_10_03_000001_split_address_and_add_lead_source_to_leads.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Poin 3 (hasil meeting Okt 2026): form New Lead dikelompokkan ulang, Customer Address dipecah
 * jadi Alamat + Kota + Provinsi + Kode Pos + Negara (sebelumnya satu kolom `address` bebas), dan
 * ditambah "Sumber Informasi Pertama". `address` lama TETAP ada (dipakai untuk baris jalan/detail
 * yang tidak masuk kategori kota/provinsi/kode pos).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->string('city')->nullable()->after('address');
            $table->string('province')->nullable()->after('city');
            $table->string('postal_code', 10)->nullable()->after('province');
            $table->string('country')->default('Indonesia')->after('postal_code');
            $table->string('lead_source')->nullable()->after('country'); // Sumber Informasi Pertama
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropColumn(['city', 'province', 'postal_code', 'country', 'lead_source']);
        });
    }
};