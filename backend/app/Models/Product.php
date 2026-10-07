<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'part_num',
        'description',
        'product_group',
        'revision',
        'uom',
        'price',
        'moq_kg',
        'active',
        'epicor_part_num',
        'sync_status',
        'last_sync_at',
    ];

    protected $attributes = [
        'revision' => 1,
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'moq_kg' => 'decimal:3',
            'revision' => 'integer',
            'active' => 'boolean',
            'last_sync_at' => 'datetime',
        ];
    }
    public function inventories(): HasMany
    {
        return $this->hasMany(Inventory::class);
    }

    public function packagings(): HasMany
    {
        return $this->hasMany(ProductPackaging::class)->where('active', true)->orderBy('gramasi_gr');
    }

    public function salesOrderLines(): HasMany
    {
        return $this->hasMany(SalesOrderLine::class);
    }
}
