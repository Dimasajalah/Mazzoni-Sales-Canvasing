<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketingIssue extends Model
{
    protected $fillable = [
        'issue_no', 'issue_reference', 'requester_name', 'notes', 'status', 'created_by',
        'recipient_type', 'recipient_name', 'purpose', 'remarks', 'completed_by', 'completed_at',
    ];

    protected $appends = ['recipient_type_label'];

    protected function casts(): array
    {
        return ['completed_at' => 'datetime'];
    }

    public function getRecipientTypeLabelAttribute(): ?string
    {
        return $this->recipient_type ? config('marketing.issue_material.recipient_types.'.$this->recipient_type, $this->recipient_type) : null;
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(MarketingIssueItem::class)->orderBy('id');
    }
}