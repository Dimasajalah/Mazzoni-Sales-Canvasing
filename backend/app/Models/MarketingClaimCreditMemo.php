<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketingClaimCreditMemo extends Model
{
    protected $fillable = [
        'marketing_claim_id', 'invoice_number', 'credit_value', 'reference', 'tax_applies', 'tax_type', 'credit_memo_number', 'status',
        'entered_by', 'entered_at', 'posted_by', 'posted_at', 'applied_by', 'applied_at',
    ];

    protected $appends = ['tax_type_label'];

    protected function casts(): array
    {
        return [
            'credit_value' => 'decimal:2',
            'tax_applies' => 'boolean',
            'entered_at' => 'datetime',
            'posted_at' => 'datetime',
            'applied_at' => 'datetime',
        ];
    }

    public function getTaxTypeLabelAttribute(): ?string
    {
        return $this->tax_type ? config('marketing.credit_memo.tax_types.'.$this->tax_type, $this->tax_type) : null;
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(MarketingClaim::class, 'marketing_claim_id');
    }

    public function enterer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'entered_by');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }

    public function applier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'applied_by');
    }
}