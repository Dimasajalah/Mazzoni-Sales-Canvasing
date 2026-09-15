<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Promotion extends Model
{
    protected $fillable = [
        'promo_code', 'name', 'description', 'promo_type', 'start_date', 'end_date',
        'minimum_qty', 'minimum_amount', 'discount_percent', 'discount_amount', 'customer_group', 'active',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'minimum_qty' => 'decimal:2',
            'minimum_amount' => 'decimal:2',
            'discount_percent' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'active' => 'boolean',
        ];
    }

    public function offerHistories(): HasMany
    {
        return $this->hasMany(PromoOfferHistory::class, 'promo_id');
    }
}
