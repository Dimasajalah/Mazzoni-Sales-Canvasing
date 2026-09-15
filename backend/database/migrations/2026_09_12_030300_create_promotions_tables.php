<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();
            $table->string('promo_code')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('promo_type'); // discount|bundle|cashback
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->decimal('minimum_qty', 15, 2)->nullable();
            $table->decimal('minimum_amount', 15, 2)->nullable();
            $table->decimal('discount_percent', 8, 2)->nullable();
            $table->decimal('discount_amount', 15, 2)->nullable();
            $table->string('customer_group')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index('promo_type');
            $table->index('active');
            $table->index(['start_date', 'end_date']);
        });

        Schema::create('promo_offer_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('promo_id')->constrained('promotions')->cascadeOnDelete();
            $table->foreignId('salesperson_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('visit_id')->nullable()->constrained('visits')->nullOnDelete();
            $table->timestamp('offered_at');
            $table->timestamps();

            $table->index(['customer_id', 'promo_id']);
            $table->index('offered_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promo_offer_histories');
        Schema::dropIfExists('promotions');
    }
};
