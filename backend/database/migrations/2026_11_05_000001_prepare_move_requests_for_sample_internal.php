<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Blueprint MJU 3.2.16 (MKT15 Move Inventory Request Sample Internal) memakai tabel permintaan MKT14 dengan type SAMPLE_INTERNAL.
 * Sample tidak terkait event (kolom event boleh kosong) dan langkah 05 mencatat nama sales beserta peruntukannya.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketing_move_requests', function (Blueprint $table) {
            $table->foreignId('marketing_event_id')->nullable()->change();
            $table->string('purpose', 150)->nullable()->after('remarks'); // peruntukan sample (langkah 05)
        });
    }

    public function down(): void
    {
        Schema::table('marketing_move_requests', function (Blueprint $table) {
            $table->dropColumn('purpose');
            $table->foreignId('marketing_event_id')->nullable(false)->change();
        });
    }
};