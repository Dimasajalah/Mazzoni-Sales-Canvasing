<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Blueprint MJU 3.2.5 (MKT05): approval berjenjang atas program klaim, lengkap dengan reason code. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketing_events', function (Blueprint $table) {
            // Tahap yang sedang menunggu keputusan (1 = Manager Marketing, 2 = Direktur Sales).
            $table->unsignedTinyInteger('approval_stage')->default(1);
        });

        Schema::create('marketing_event_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketing_event_id')->constrained('marketing_events')->cascadeOnDelete();
            $table->unsignedTinyInteger('stage');
            $table->string('action', 10);        // APPROVED | REJECTED
            $table->string('reason_code', 40);
            $table->text('notes')->nullable();
            $table->foreignId('acted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('acted_at');
            $table->timestamps();

            $table->index(['marketing_event_id', 'stage']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_event_approvals');
        Schema::table('marketing_events', function (Blueprint $table) {
            $table->dropColumn('approval_stage');
        });
    }
};