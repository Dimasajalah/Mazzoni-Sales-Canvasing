<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromoOfferHistory extends Model
{
    protected $fillable = [
        'customer_id', 'promo_id', 'salesperson_id', 'visit_id', 'offered_at',
    ];

    protected function casts(): array
    {
        return ['offered_at' => 'datetime'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function promo(): BelongsTo
    {
        return $this->belongsTo(Promotion::class, 'promo_id');
    }

    public function salesperson(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesperson_id');
    }

    public function visit(): BelongsTo
    {
        return $this->belongsTo(Visit::class);
    }
}
