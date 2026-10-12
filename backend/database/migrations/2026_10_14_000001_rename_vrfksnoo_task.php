<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Dokumen hal. 26: Next Task setelah Brand Awareness adalah "VRFKSNOO — Verifikasi NOO melalui WhatsApp".
 * Nama template (dan tugas yang sudah dibuat dari template itu) disesuaikan.
 */
return new class extends Migration
{
    private const NEW_NAME = 'Verifikasi NOO melalui WhatsApp';

    private const OLD_NAME = 'Verifikasi NOO';

    public function up(): void
    {
        DB::table('task_templates')->where('code', 'VRFKSNOO')->update(['name' => self::NEW_NAME]);
        DB::table('lead_tasks')->where('code', 'VRFKSNOO')->update(['name' => self::NEW_NAME]);
    }

    public function down(): void
    {
        DB::table('task_templates')->where('code', 'VRFKSNOO')->update(['name' => self::OLD_NAME]);
        DB::table('lead_tasks')->where('code', 'VRFKSNOO')->update(['name' => self::OLD_NAME]);
    }
};