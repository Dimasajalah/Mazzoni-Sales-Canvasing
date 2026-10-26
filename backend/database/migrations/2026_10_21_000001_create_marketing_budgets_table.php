<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.1 (MKT01 Budget Marketing Entry): Campaign yang menampung budget marketing per tahun. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_budgets', function (Blueprint $table) {
            $table->id();
            // Sama dengan MktgCampaignID di Epicor; kosong saat input -> dibuat otomatis (BDG-{tahun}-{urut}).
            $table->string('campaign_code', 30)->unique();
            $table->string('name', 150);
            $table->unsignedSmallInteger('fiscal_year');
            $table->decimal('total_budget', 15, 2);
            // Diisi nanti oleh Event/Klaim Entry (MKT02/03); tahap ini selalu 0.
            $table->decimal('allocated_amount', 15, 2)->default(0);
            $table->text('description')->nullable();
            $table->string('status', 20)->default('ACTIVE'); // ACTIVE | CLOSED
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            // Disiapkan untuk sinkron ke Epicor (Campaign); belum dipakai di tahap ini.
            $table->timestamp('epicor_synced_at')->nullable();
            $table->timestamps();

            $table->index('fiscal_year');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_budgets');
    }
};