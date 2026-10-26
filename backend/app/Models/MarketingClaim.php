<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketingClaim extends Model
{
    protected $fillable = [
        'claim_no', 'marketing_event_id', 'customer_id', 'letter_received_date', 'claimed_amount', 'notes', 'status', 'is_late',
        'pass_decision', 'pass_by', 'pass_at', 'pass_reason_code', 'pass_notes',
        'eligible_amount', 'difference_amount', 'calc_detail', 'calculated_at', 'calculated_by',
        'payout_method', 'submitted_at', 'submitted_by', 'approved_amount', 'created_by',
        'approval_stage', 'diff_confirmed_at', 'diff_confirmed_by', 'diff_confirm_notes',
        'adjusted_amount', 'adjust_reason', 'adjusted_by', 'adjusted_at', 'final_confirmed_by', 'final_confirmed_at',
    ];

    protected $appends = ['payout_method_label'];

    protected function casts(): array
    {
        return [
            'letter_received_date' => 'date:Y-m-d',
            'claimed_amount' => 'decimal:2',
            'is_late' => 'boolean',
            'pass_at' => 'datetime',
            'eligible_amount' => 'decimal:2',
            'difference_amount' => 'decimal:2',
            'calc_detail' => 'array',
            'calculated_at' => 'datetime',
            'submitted_at' => 'datetime',
            'approved_amount' => 'decimal:2',
            'approval_stage' => 'integer',
            'diff_confirmed_at' => 'datetime',
            'adjusted_amount' => 'decimal:2',
            'adjusted_at' => 'datetime',
            'final_confirmed_at' => 'datetime',
        ];
    }

    public function getPayoutMethodLabelAttribute(): ?string
    {
        return $this->payout_method ? config('marketing.claim_submission.payout_methods.'.$this->payout_method, $this->payout_method) : null;
    }

    public function program(): BelongsTo
    {
        return $this->belongsTo(MarketingEvent::class, 'marketing_event_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function passer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'pass_by');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function diffConfirmer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'diff_confirmed_by');
    }

    public function adjuster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'adjusted_by');
    }

    public function finalizer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'final_confirmed_by');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(MarketingClaimApproval::class)->orderBy('id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(MarketingClaimAttachment::class);
    }
}