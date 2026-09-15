<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Inventory extends Model
{
    protected $table = 'inventories';

    protected $fillable = [
        'product_id', 'warehouse', 'bin', 'on_hand_qty', 'allocated_qty', 'available_qty',
    ];

    protected function casts(): array
    {
        return [
            'on_hand_qty' => 'decimal:2',
            'allocated_qty' => 'decimal:2',
            'available_qty' => 'decimal:2',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
