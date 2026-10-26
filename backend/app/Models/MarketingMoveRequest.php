<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketingMoveRequest extends Model
{
    protected $fillable = [
        'req_no', 'type', 'marketing_event_id', 'notes', 'status', 'created_by', 'onhand_notes', 'onhand_checked_by', 'onhand_checked_at',
        'epicor_request_no', 'requested_by', 'requested_at', 'pra_sj_number', 'transferred_by', 'transferred_at', 'issue_reference', 'issued_by', 'issued_at',
        'recipient_name', 'remarks', 'purpose', 'completed_by', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'onhand_checked_at' => 'datetime', 'requested_at' => 'datetime', 'transferred_at' => 'datetime', 'issued_at' => 'datetime', 'completed_at' => 'datetime',
        ];
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(MarketingEvent::class, 'marketing_event_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(MarketingMoveRequestItem::class)->orderBy('id');
    }
}