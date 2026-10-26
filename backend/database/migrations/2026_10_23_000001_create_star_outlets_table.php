<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.3 (MKT03 Star Outlet Request) langkah 02: Marketing mencentang "Star Outlet Aktif" pada outlet. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('star_outlets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained('customers')->cascadeOnDelete();
            $table->boolean('active')->default(true); // "Star Outlet Aktif"
            // Langkah 01 terjadi di luar sistem (Dokumen 01: Pengajuan Star Outlet); hanya dicatat sebagai referensi.
            $table->string('requested_by', 150)->nullable();      // distributor pengaju
            $table->string('request_reference', 100)->nullable(); // nomor / referensi dokumen pengajuan
            $table->text('notes')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('deactivated_at')->nullable();
            $table->foreignId('activated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('star_outlets');
    }
};