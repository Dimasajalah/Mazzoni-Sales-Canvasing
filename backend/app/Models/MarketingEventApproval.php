<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketingEventApproval extends Model
{
    protected $fillable = ['marketing_event_id', 'stage', 'round', 'stage_label', 'action', 'reason_code', 'notes', 'acted_by', 'acted_at'];

    protected $appends = ['reason_label'];

    protected function casts(): array
    {
        return ['stage' => 'integer', 'round' => 'integer', 'acted_at' => 'datetime'];
    }

    public function getReasonLabelAttribute(): string
    {
        $type = $this->action === 'APPROVED' ? 'APPROVE' : 'REJECT';

        return config("marketing.approval_reason_codes.{$type}.{$this->reason_code}", $this->reason_code);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acted_by');
    }
}