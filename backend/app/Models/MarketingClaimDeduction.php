<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketingClaimDeduction extends Model
{
    protected $fillable = [
        'marketing_claim_id', 'invoice_number', 'invoice_date', 'invoice_total', 'claim_amount_used', 'capped_by_invoice',
        'misc_charge_code', 'misc_charge_amount', 'reference', 'balance_before', 'balance_after', 'posted_by', 'posted_at',
    ];

    protected $appends = ['net_invoice'];

    protected function casts(): array
    {
        return [
            'invoice_date' => 'date:Y-m-d',
            'invoice_total' => 'decimal:2',
            'claim_amount_used' => 'decimal:2',
            'capped_by_invoice' => 'boolean',
            'misc_charge_amount' => 'decimal:2',
            'balance_before' => 'decimal:2',
            'balance_after' => 'decimal:2',
            'posted_at' => 'datetime',
        ];
    }

    /** Total nota setelah potongan klaim. */
    public function getNetInvoiceAttribute(): float
    {
        return round((float) $this->invoice_total - (float) $this->claim_amount_used, 2);
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(MarketingClaim::class, 'marketing_claim_id');
    }

    public function poster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'posted_by');
    }
}