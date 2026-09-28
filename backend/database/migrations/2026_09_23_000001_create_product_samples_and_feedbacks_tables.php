<?php
// backend/database/migrations/2026_09_23_000001_create_product_samples_and_feedbacks_tables.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_samples', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $table->foreignId('salesperson_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('product_name')->default('Sample');
            $table->string('flavor_variant'); // BBQ / Red Hot / Mayonaise — sementara free text, master data menyusul
            $table->unsignedInteger('version');
            $table->unsignedInteger('qty');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('customer_id');
            $table->index('lead_id');
            $table->index('salesperson_id');
        });

        Schema::create('product_sample_feedbacks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_sample_id')->nullable()->constrained('product_samples')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
            $table->foreignId('salesperson_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('version_sample');
            $table->string('batch_number');
            $table->string('feedback_type'); // interest | not_interest | revision
            $table->json('revision_types')->nullable(); // ["warna","tekstur","bau","rasa"] — hanya diisi kalau feedback_type = revision
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('product_sample_id');
            $table->index('customer_id');
            $table->index('lead_id');
            $table->index('feedback_type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_sample_feedbacks');
        Schema::dropIfExists('product_samples');
    }
};