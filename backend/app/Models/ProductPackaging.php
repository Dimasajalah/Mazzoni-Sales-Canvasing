<?php
// backend/app/Models/ProductPackaging.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Kemasan + gramasi per produk (gram per pcs). */
class ProductPackaging extends Model
{
    protected $fillable = ['product_id', 'name', 'gramasi_gr', 'active'];

    protected function casts(): array
    {
        return ['gramasi_gr' => 'decimal:2', 'active' => 'boolean'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
