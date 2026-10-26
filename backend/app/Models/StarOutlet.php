<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StarOutlet extends Model
{
    protected $fillable = [
        'customer_id', 'active', 'requested_by', 'request_reference', 'notes',
        'activated_at', 'deactivated_at', 'activated_by',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'activated_at' => 'datetime',
            'deactivated_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function activator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'activated_by');
    }
}