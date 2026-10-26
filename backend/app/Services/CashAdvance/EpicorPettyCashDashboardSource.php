<?php
//backend/app/Services/CashAdvance/EpicorPettyCashDashboardSource.php
namespace App\Services\CashAdvance;

/**
 * TODO: lengkapi setelah BAQ BMT_PettyCash_Summary / _Category / _Docs sudah dibuat di Epicor (FDD 2.4).
 * Pola REST dan parameter BAQ (nama field, cara kirim Sales ID & Bulan) menunggu konfirmasi dari BAQ asli —
 * jangan dipakai dulu (source tetap 'staging') sebelum ini selesai.
 */
class EpicorPettyCashDashboardSource implements PettyCashDashboardSource
{
    public function summary(string $salesId, string $month): ?array
    {
        throw new \RuntimeException('EpicorPettyCashDashboardSource belum diimplementasikan — BAQ BMT_PettyCash_Summary belum dikonfirmasi.');
    }

    public function categories(string $salesId, string $month): array
    {
        throw new \RuntimeException('EpicorPettyCashDashboardSource belum diimplementasikan — BAQ BMT_PettyCash_Category belum dikonfirmasi.');
    }

    public function documents(string $salesId, string $month, string $direction, ?string $operationType = null): array
    {
        throw new \RuntimeException('EpicorPettyCashDashboardSource belum diimplementasikan — BAQ BMT_PettyCash_Docs belum dikonfirmasi.');
    }
}