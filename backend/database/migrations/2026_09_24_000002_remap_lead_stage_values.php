<?php
// backend/database/migrations/2026_09_24_000002_remap_lead_stage_values.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('leads')->whereIn('stage', ['NEW', 'CONTACTED'])->update(['stage' => 'LEAD']);
        DB::table('leads')->where('stage', 'QUALIFIED')->update(['stage' => 'OPPORTUNITY']);
        DB::table('leads')->whereIn('stage', ['QUOTE', 'WON'])->update(['stage' => 'QUOTE']);
        // 'LOST' dibiarkan apa adanya
    }

    public function down(): void
    {
        DB::table('leads')->where('stage', 'LEAD')->update(['stage' => 'NEW']);
        DB::table('leads')->where('stage', 'OPPORTUNITY')->update(['stage' => 'QUALIFIED']);
        DB::table('leads')->where('stage', 'QUOTE')->update(['stage' => 'QUOTE']);
    }
};