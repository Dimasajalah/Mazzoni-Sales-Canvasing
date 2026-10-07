<?php
// backend/database/migrations/2026_09_30_000001_add_sales_type_lead_closure_and_delegations.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Tahap 7 (poin 11):
 *  - users.sales_type: Sales Dealmaker (tidak bisa order) atau Sales Order (tidak bisa delegasi).
 *    Role tetap 'sales' agar seluruh pembatasan data yang sudah ada tidak berubah. Sales yang sudah ada = ORDER.
 *  - leads.closed_at + leads.territory: dasar laporan NOO per sales dan per territory
 *    (territory disalin saat lead dibuat agar histori tidak berubah bila sales pindah territory).
 *  - lead_delegations: riwayat delegasi lead yang sudah Win ke sales lain untuk dibuatkan order.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('sales_type', 12)->default('ORDER')->after('role'); // DEALMAKER | ORDER
        });

        Schema::table('leads', function (Blueprint $table) {
            $table->timestamp('closed_at')->nullable()->after('win_loss');
            $table->string('territory', 60)->nullable()->after('salesperson_id');

            $table->index('closed_at');
            $table->index('territory');
        });

        // Data yang sudah ada: waktu tutup mengikuti updated_at, territory mengikuti pemilik lead saat ini
        DB::table('leads')->whereIn('win_loss', ['WIN', 'LOSE'])->update(['closed_at' => DB::raw('updated_at')]);
        DB::statement('UPDATE leads SET territory = (SELECT users.territory FROM users WHERE users.id = leads.salesperson_id)');

        Schema::create('lead_delegations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('lead_id')->constrained('leads')->cascadeOnDelete();
            $table->foreignId('from_user_id')->constrained('users');
            $table->foreignId('to_user_id')->constrained('users');
            $table->string('status', 10)->default('PENDING');   // PENDING | ORDERED | CANCELLED
            $table->string('note', 255)->nullable();
            $table->timestamp('delegated_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('order_id')->nullable()->constrained('sales_orders')->nullOnDelete();
            $table->timestamps();

            $table->index(['to_user_id', 'status']);
            $table->index(['from_user_id', 'status']);
            $table->index('lead_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_delegations');

        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['closed_at']);
            $table->dropIndex(['territory']);
            $table->dropColumn(['closed_at', 'territory']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('sales_type');
        });
    }
};
