<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('part_num')->unique();
            $table->string('description');
            $table->string('uom')->default('PCS');
            $table->decimal('price', 15, 2)->default(0);
            $table->boolean('active')->default(true);
            $table->string('epicor_part_num')->nullable();
            $table->string('sync_status')->default('NOT_REQUIRED');
            $table->timestamp('last_sync_at')->nullable();
            $table->timestamps();

            $table->index('active');
            $table->index('sync_status');
        });

        Schema::create('inventories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('warehouse');
            $table->string('bin')->nullable();
            $table->decimal('on_hand_qty', 15, 2)->default(0);
            $table->decimal('allocated_qty', 15, 2)->default(0);
            $table->decimal('available_qty', 15, 2)->default(0);
            $table->timestamps();

            $table->unique(['product_id', 'warehouse', 'bin']);
            $table->index('warehouse');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventories');
        Schema::dropIfExists('products');
    }
};
