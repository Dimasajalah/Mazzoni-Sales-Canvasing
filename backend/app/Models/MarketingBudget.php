<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketingBudget extends Model
{
    protected $fillable = [
        'campaign_code', 'name', 'fiscal_year', 'total_budget', 'allocated_amount',
        'description', 'status', 'created_by', 'epicor_synced_at',
    ];

    protected $appends = ['remaining_budget'];

    protected function casts(): array
    {
        return [
            'fiscal_year' => 'integer',
            'total_budget' => 'decimal:2',
            'allocated_amount' => 'decimal:2',
            'epicor_synced_at' => 'datetime',
        ];
    }

    public function getRemainingBudgetAttribute(): float
    {
        return round((float) $this->total_budget - (float) $this->allocated_amount, 2);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}