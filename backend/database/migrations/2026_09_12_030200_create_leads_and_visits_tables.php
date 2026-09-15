<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leads', function (Blueprint $table) {
            $table->id();
            $table->string('business_name');
            $table->string('owner_name')->nullable();
            $table->text('address')->nullable();
            $table->string('phone')->nullable();
            $table->string('email')->nullable();
            $table->string('business_type')->nullable();
            $table->string('npwp')->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->foreignId('salesperson_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('stage')->default('NEW');
            $table->decimal('estimated_value', 15, 2)->nullable();
            $table->date('register_date')->nullable();
            $table->uuid('client_uuid')->nullable()->unique();
            $table->timestamps();

            $table->index('salesperson_id');
            $table->index('stage');
            $table->index('register_date');
        });

        Schema::create('lead_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('activity_type');
            $table->text('notes')->nullable();
            $table->string('from_stage')->nullable();
            $table->string('to_stage')->nullable();
            $table->timestamps();

            $table->index('lead_id');
        });

        Schema::create('lead_followups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->foreignId('salesperson_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('followup_at');
            $table->text('notes')->nullable();
            $table->string('status')->default('PENDING');
            $table->timestamps();

            $table->index(['lead_id', 'followup_at']);
            $table->index('status');
        });

        Schema::create('visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('salesperson_id')->constrained('users')->cascadeOnDelete();
            $table->timestamp('checkin_at')->nullable();
            $table->decimal('checkin_latitude', 10, 7)->nullable();
            $table->decimal('checkin_longitude', 10, 7)->nullable();
            $table->decimal('checkin_accuracy', 10, 2)->nullable();
            $table->decimal('checkin_distance', 10, 2)->nullable();
            $table->timestamp('checkout_at')->nullable();
            $table->decimal('checkout_latitude', 10, 7)->nullable();
            $table->decimal('checkout_longitude', 10, 7)->nullable();
            $table->unsignedInteger('duration_minutes')->nullable();
            $table->string('visit_result')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('customer_id');
            $table->index('salesperson_id');
            $table->index('checkin_at');
        });

        Schema::create('visit_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('visit_id')->constrained('visits')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('activity_type');
            $table->text('notes')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index('visit_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('visit_activities');
        Schema::dropIfExists('visits');
        Schema::dropIfExists('lead_followups');
        Schema::dropIfExists('lead_activities');
        Schema::dropIfExists('leads');
    }
};
