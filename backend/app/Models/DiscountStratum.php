<?php
// backend/app/Models/DiscountStratum.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tier diskon strata berdasarkan jumlah Kg. product_id null = berlaku untuk semua produk. */
class DiscountStratum extends Model
{
    protected $table = 'discount_strata';

    protected $fillable = ['product_id', 'min_kg', 'max_kg', 'discount_percent', 'active'];

    protected function casts(): array
    {
        return [
            'min_kg' => 'decimal:3',
            'max_kg' => 'decimal:3',
            'discount_percent' => 'decimal:2',
            'active' => 'boolean',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
