<?php
// backend/app/Models/QuoteLine.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuoteLine extends Model
{
    protected $fillable = [
        'quote_id', 'product_id', 'description', 'qty_kg', 'packaging_id', 'gramasi_gr', 'qty_pcs',
        'uom', 'unit_price', 'disc_percent', 'strata_percent',
        'disc1_percent', 'disc2_percent', 'disc3_percent', 'disc4_percent', 'line_total',
    ];

    protected function casts(): array
    {
        return [
            'qty_kg' => 'decimal:3',
            'gramasi_gr' => 'decimal:2',
            'qty_pcs' => 'integer',
            'unit_price' => 'decimal:2',
            'disc_percent' => 'decimal:2',
            'strata_percent' => 'decimal:2',
            'disc1_percent' => 'decimal:2',
            'disc2_percent' => 'decimal:2',
            'disc3_percent' => 'decimal:2',
            'disc4_percent' => 'decimal:2',
            'line_total' => 'decimal:2',
        ];
    }

    /**
     * Diskon efektif gabungan (poin 15): strata lalu Disc 1-4 bertingkat — tiap persen memotong
     * dari SISA setelah potongan sebelumnya, bukan dijumlah. Dikembalikan sebagai satu persen
     * setara terhadap harga kotor, supaya kode lama (mis. konversi ke Sales Order) tetap jalan.
     */
    public function effectivePercent(): float
    {
        return self::cascadePercent([
            (float) $this->strata_percent,
            (float) $this->disc1_percent,
            (float) $this->disc2_percent,
            (float) $this->disc3_percent,
            (float) $this->disc4_percent,
        ]);
    }

    /** @param  float[]  $percents */
    public static function cascadePercent(array $percents): float
    {
        $multiplier = 1.0;
        foreach ($percents as $p) {
            $multiplier *= (1 - min(100.0, max(0.0, $p)) / 100);
        }

        return round((1 - $multiplier) * 100, 4);
    }

    public function quote(): BelongsTo
    {
        return $this->belongsTo(Quote::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function packaging(): BelongsTo
    {
        return $this->belongsTo(ProductPackaging::class, 'packaging_id');
    }
}