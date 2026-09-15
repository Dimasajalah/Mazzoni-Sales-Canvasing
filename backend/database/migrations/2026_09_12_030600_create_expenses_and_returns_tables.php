<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->string('expense_number')->unique();
            $table->foreignId('salesperson_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->string('category');
            $table->decimal('amount', 15, 2);
            $table->text('note')->nullable();
            $table->date('expense_date');
            $table->string('status')->default('DRAFT');
            $table->uuid('client_uuid')->nullable()->unique();
            $table->timestamps();

            $table->index('salesperson_id');
            $table->index('customer_id');
            $table->index('status');
            $table->index('expense_date');
        });

        Schema::create('expense_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('expense_id')->constrained('expenses')->cascadeOnDelete();
            $table->string('path');
            $table->string('filename');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();

            $table->index('expense_id');
        });

        Schema::create('expense_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('expense_id')->constrained('expenses')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status')->nullable();
            $table->string('to_status');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('expense_id');
        });

        Schema::create('return_requests', function (Blueprint $table) {
            $table->id();
            $table->string('return_number')->unique();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('salesperson_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('so_reference')->nullable();
            $table->text('reason')->nullable();
            $table->text('condition_notes')->nullable();
            $table->string('status')->default('SUBMITTED');
            $table->string('rma_number')->nullable()->unique();
            $table->string('epicor_rma_num')->nullable();
            $table->uuid('client_uuid')->nullable()->unique();
            $table->timestamps();

            $table->index('customer_id');
            $table->index('salesperson_id');
            $table->index('status');
        });

        Schema::create('return_request_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('return_request_id')->constrained('return_requests')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->decimal('qty', 15, 2);
            $table->timestamps();

            $table->index('return_request_id');
        });

        Schema::create('return_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('return_request_id')->constrained('return_requests')->cascadeOnDelete();
            $table->string('path');
            $table->string('filename');
            $table->string('mime')->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();

            $table->index('return_request_id');
        });

        Schema::create('return_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('return_request_id')->constrained('return_requests')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status')->nullable();
            $table->string('to_status');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('return_request_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('return_status_histories');
        Schema::dropIfExists('return_attachments');
        Schema::dropIfExists('return_request_lines');
        Schema::dropIfExists('return_requests');
        Schema::dropIfExists('expense_status_histories');
        Schema::dropIfExists('expense_attachments');
        Schema::dropIfExists('expenses');
    }
};
