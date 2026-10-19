<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_advance_notifications', function (Blueprint $table) {
            $table->id();
            $table->string('doc_key', 64)->unique(); // SysRowID dokumen Cash Issue di Epicor: mencegah notifikasi ganda
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('recipient_ref', 100); // Mobile App User ID di Epicor
            $table->string('cash_desk_id', 30)->nullable();
            $table->string('cash_desk_to', 30)->nullable();
            $table->string('cash_desk_to_name', 150)->nullable();
            $table->unsignedBigInteger('reference_num')->nullable();
            $table->string('legal_number', 60)->nullable();
            $table->date('apply_date')->nullable();
            $table->decimal('amount', 18, 2);
            $table->string('currency', 3)->default('IDR');
            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_advance_notifications');
    }
};