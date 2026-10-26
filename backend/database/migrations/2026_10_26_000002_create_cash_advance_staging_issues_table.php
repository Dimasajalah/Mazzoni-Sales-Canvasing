<?php
//backend/database/migrations/2026_10_26_000002_create_cash_advance_staging_issues_table.php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_advance_staging_issues', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('operation_type', 100);   // mis. "Biaya BBM Sales"
            $table->string('display_name', 100);     // mis. "Bensin"
            $table->decimal('cash_amount', 18, 2);
            $table->string('customer_ref', 150)->nullable();
            $table->text('comment');
            $table->date('creation_date');
            $table->json('attachments')->nullable();  // [{path, original_name}]
            $table->timestamps();

            $table->index(['user_id', 'creation_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_advance_staging_issues');
    }
};