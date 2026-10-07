<?php
// backend/app/Models/LeadJourneyEntry.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Catatan form journey per lead: BRAND (tertarik/tidak) dan NEGOTIATION. */
class LeadJourneyEntry extends Model
{
    public const BRAND = 'BRAND';

    public const NEGOTIATION = 'NEGOTIATION';

    protected $fillable = [
        'lead_id', 'lead_task_id', 'entry_type', 'decision', 'reason', 'offer',
        'customer_response', 'next_action_date', 'notes', 'created_by',
    ];

    protected function casts(): array
    {
        return ['next_action_date' => 'date:Y-m-d'];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(LeadTask::class, 'lead_task_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
