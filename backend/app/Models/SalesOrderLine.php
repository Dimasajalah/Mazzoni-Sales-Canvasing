<?php
// backend/app/Models/SalesOrderLine.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesOrderLine extends Model
{
    protected $fillable = [
        'order_id', 'product_id', 'is_custom', 'custom_part_name',
        'qty', 'qty_kg', 'gramasi_gr', 'qty_pcs', 'packaging_id',
        'uom', 'unit_price', 'discount', 'line_total',
    ];

    protected function casts(): array
    {
        return [
            'is_custom' => 'boolean',
            'qty' => 'decimal:2',
            'qty_kg' => 'decimal:3',
            'gramasi_gr' => 'decimal:2',
            'unit_price' => 'decimal:2',
            'discount' => 'decimal:2',
            'line_total' => 'decimal:2',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'order_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Nama produk untuk ditampilkan — dari master Product kalau bukan NPD,
     * atau dari custom_part_name kalau produk NPD (free-text).
     */
    public function getDisplayNameAttribute(): string
    {
        if ($this->is_custom) {
            return $this->custom_part_name ?? '(Produk NPD tanpa nama)';
        }

        return $this->product?->name ?? '(Produk tidak ditemukan)';
    }
}