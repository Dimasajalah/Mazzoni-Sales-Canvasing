<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.7 (MKT07 Upload Data Sell Out): berkas sell out distributor per program klaim, divalidasi per baris. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_sellout_uploads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_event_id')->constrained('marketing_events')->cascadeOnDelete();
            $table->string('filename');
            $table->string('status', 12);                        // VALID | REJECTED | SUPERSEDED
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('error_count')->default(0);
            $table->json('errors')->nullable();                  // baris yang ditolak + alasannya (maksimal 200 yang pertama)
            $table->decimal('total_qty', 18, 3)->default(0);
            $table->decimal('total_amount', 18, 2)->default(0);
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['marketing_event_id', 'status']);
        });

        // Baris hanya disimpan bila seluruh berkas valid (semua atau tidak sama sekali).
        Schema::create('marketing_sellout_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('upload_id')->constrained('marketing_sellout_uploads')->cascadeOnDelete();
            $table->unsignedInteger('row_no');
            $table->date('sale_date');
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('customer_code', 50);
            $table->string('salesperson_code', 50);
            $table->string('part_num', 60);
            $table->decimal('qty', 18, 3)->nullable();
            $table->decimal('amount', 18, 2)->nullable();

            $table->index('upload_id');
            $table->index('customer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_sellout_rows');
        Schema::dropIfExists('marketing_sellout_uploads');
    }
};