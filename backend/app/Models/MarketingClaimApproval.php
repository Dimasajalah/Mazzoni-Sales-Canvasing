<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketingClaimApproval extends Model
{
    protected $fillable = ['marketing_claim_id', 'stage', 'stage_label', 'action', 'reason_code', 'notes', 'adjusted_amount', 'adjust_reason', 'acted_by', 'acted_at'];

    protected $appends = ['reason_label'];

    protected function casts(): array
    {
        return ['stage' => 'integer', 'adjusted_amount' => 'decimal:2', 'acted_at' => 'datetime'];
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