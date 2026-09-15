<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Visit extends Model
{
    protected $fillable = [
        'customer_id', 'salesperson_id', 'checkin_at', 'checkin_latitude', 'checkin_longitude',
        'checkin_accuracy', 'checkin_distance', 'checkout_at', 'checkout_latitude', 'checkout_longitude',
        'duration_minutes', 'visit_result', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'checkin_at' => 'datetime',
            'checkout_at' => 'datetime',
            'checkin_latitude' => 'decimal:7',
            'checkin_longitude' => 'decimal:7',
            'checkout_latitude' => 'decimal:7',
            'checkout_longitude' => 'decimal:7',
            'checkin_accuracy' => 'decimal:2',
            'checkin_distance' => 'decimal:2',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function salesperson(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesperson_id');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(VisitActivity::class);
    }
}
