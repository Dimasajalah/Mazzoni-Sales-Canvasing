<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Blueprint MJU 5.2.14 (SL14 Achievement Sales). Data Sales Target dan Achievement dihitung manual di luar sistem,
 * lalu diinput/diupload sebagai sumber dua dashboard (Last Achievement = periode sebelumnya, Actual Achievement =
 * periode berjalan vs target). Aplikasi hanya menyimpan dan menampilkan angkanya, tidak menghitung capaian.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_achievement_uploads', function (Blueprint $table) {
            $table->id();
            $table->string('filename');
            $table->string('status', 20); // VALID, REJECTED
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('error_count')->default(0);
            $table->json('errors')->nullable();
            $table->foreignId('uploaded_by')->constrained('users');
            $table->timestamps();
        });

        Schema::create('sales_achievement_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('upload_id')->constrained('sales_achievement_uploads')->cascadeOnDelete();
            $table->string('period', 7); // YYYY-MM
            $table->foreignId('salesperson_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('salesperson_code');
            $table->decimal('target', 18, 2)->default(0);
            $table->decimal('actual', 18, 2)->default(0);
            $table->timestamps();

            $table->index(['period', 'salesperson_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_achievement_rows');
        Schema::dropIfExists('sales_achievement_uploads');
    }
};