<?php
// backend/app/Services/PackagingService.php

namespace App\Services;

use App\Models\DiscountStratum;
use InvalidArgumentException;

/**
 * Konversi Kg -> pcs dan pencarian diskon strata.
 *
 * Rumus: pcs = Kg x 1000 / gramasi (gr per pcs), dibulatkan sesuai config('canvassing.pcs_rounding').
 */
class PackagingService
{
    public function kgToPcs(float $kg, float $gramasi): int
    {
        if ($kg <= 0) {
            throw new InvalidArgumentException('Jumlah Kg harus lebih dari 0.');
        }
        if ($gramasi <= 0) {
            throw new InvalidArgumentException('Gramasi harus lebih dari 0.');
        }

        // round(..., 6) membuang sisa presisi floating point (mis. 0,7 x 1000 = 700,0000000000001)
        $raw = round($kg * 1000 / $gramasi, 6);

        $pcs = match (config('canvassing.pcs_rounding', 'ceil')) {
            'floor' => floor($raw),
            'round' => round($raw),
            default => ceil($raw),
        };

        return max(1, (int) $pcs);
    }

    /**
     * Persen diskon strata untuk produk & jumlah Kg tertentu.
     * Tier khusus produk didahulukan atas tier umum (product_id null); di antara yang cocok dipilih min_kg tertinggi.
     */
    public function strataPercent(?int $productId, float $kg): float
    {
        $tier = DiscountStratum::query()
            ->where('active', true)
            ->where(fn ($q) => $q->whereNull('product_id')->when($productId, fn ($w) => $w->orWhere('product_id', $productId)))
            ->where('min_kg', '<=', $kg)
            ->where(fn ($q) => $q->whereNull('max_kg')->orWhere('max_kg', '>=', $kg))
            ->orderByRaw('product_id IS NULL')   // yang punya product_id lebih dulu
            ->orderByDesc('min_kg')
            ->first();

        return $tier ? (float) $tier->discount_percent : 0.0;
    }
}
