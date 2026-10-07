<?php
// backend/database/migrations/2026_10_04_000001_simplify_b2b_task_set_to_four_stages.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Poin 7 (hasil meeting Okt 2026): Canvassing B2B dirampingkan dari 7 langkah jadi persis 4
 * tahap — Brand Awareness, Sample, Quotation, Order — mengikuti pola "journey" yang dibahas di
 * transkrip (brand_awareness/sample/quote/order sebagai satu-satunya tahapan, bukan dipecah lagi
 * jadi identifikasi/hubungi/kualifikasi terpisah).
 *
 * Tugas yang SUDAH berjalan di lead manapun tidak terpengaruh (LeadTask menyimpan salinan field
 * sendiri, bukan join langsung ke TaskTemplate) — cuma pilihan "Tugas berikutnya" untuk tugas baru
 * yang berubah mengikuti 4 tahap ini. Aksi "negotiation" (dulu tugas tersendiri "Kualifikasi
 * kebutuhan") dipindah jadi tombol tambahan di tahap Quotation, supaya kemampuannya tidak hilang.
 */
return new class extends Migration
{
    private const OLD_STEPS = [
        [10, 'Identifikasi & prioritas customer', 'Desk Call', 'LEAD', 'Desk Call', false, false, [], 'prospek'],
        [20, 'Hubungi & jadwalkan kunjungan', 'Panggilan Telepon', 'LEAD', 'Desk Call', false, false, [], 'lead'],
        [30, 'Kunjungan perkenalan (canvassing)', 'Kunjungan', 'OPPORTUNITY', 'Sales Lapangan', true, false, ['brand'], 'brand_awareness'],
        [40, 'Pengajuan Sample', 'Kunjungan', 'OPPORTUNITY', 'Sales Lapangan', true, false, ['sample', 'feedback'], 'sampling'],
        [50, 'Kualifikasi kebutuhan', 'Meeting', 'OPPORTUNITY', 'Sales Lapangan', false, false, ['negotiation'], 'sampling'],
        [60, 'Susun Quotation (quote)', 'Quote', 'QUOTE', 'Sales Lapangan', true, false, ['quote'], 'quote'],
        [70, 'Follow-up Quotation & closing', 'Follow-up', 'QUOTE', 'Sales Lapangan', false, true, ['order'], 'quote'],
    ];

    private const NEW_STEPS = [
        [10, 'Brand Awareness', 'Kunjungan', 'LEAD', 'Sales Lapangan', true, false, ['brand'], 'brand_awareness'],
        [20, 'Sample', 'Kunjungan', 'OPPORTUNITY', 'Sales Lapangan', true, false, ['sample', 'feedback'], 'sampling'],
        [30, 'Quotation', 'Quote', 'QUOTE', 'Sales Lapangan', true, false, ['quote', 'negotiation'], 'quote'],
        [40, 'Order', 'Follow-up', 'QUOTE', 'Sales Lapangan', false, true, ['order'], 'quote'],
    ];

    public function up(): void
    {
        $this->replaceWith(self::NEW_STEPS);
    }

    public function down(): void
    {
        $this->replaceWith(self::OLD_STEPS);
    }

    private function replaceWith(array $steps): void
    {
        $now = now();
        $setId = DB::table('task_sets')->where('code', 'B2B')->value('id');
        if (! $setId) {
            return;
        }

        DB::table('task_templates')->where('task_set_id', $setId)->delete();

        foreach ($steps as [$seq, $name, $type, $stage, $role, $needsSchedule, $closing, $actions, $step]) {
            DB::table('task_templates')->insert([
                'task_set_id' => $setId,
                'seq' => $seq,
                'name' => $name,
                'task_type' => $type,
                'stage' => $stage,
                'required_role' => $role,
                'mandatory' => false,
                'needs_schedule' => $needsSchedule,
                'is_closing' => $closing,
                'actions' => json_encode($actions),
                'pipeline_step' => $step,
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }
};