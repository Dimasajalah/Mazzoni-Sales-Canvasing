<?php
// backend/app/Models/LeadDelegation.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Riwayat delegasi lead yang sudah Win ke sales lain untuk dibuatkan order. */
class LeadDelegation extends Model
{
    public const PENDING = 'PENDING';

    public const ORDERED = 'ORDERED';

    public const CANCELLED = 'CANCELLED';

    protected $fillable = [
        'lead_id', 'from_user_id', 'to_user_id', 'status', 'note',
        'delegated_at', 'completed_at', 'cancelled_at', 'order_id',
    ];

    protected function casts(): array
    {
        return [
            'delegated_at' => 'datetime',
            'completed_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function from(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }

    public function to(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class, 'order_id');
    }
}
