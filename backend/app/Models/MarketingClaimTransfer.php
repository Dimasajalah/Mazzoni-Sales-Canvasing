<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketingClaimTransfer extends Model
{
    protected $fillable = [
        'marketing_claim_id', 'bank_name', 'account_number', 'account_name', 'is_individual', 'is_pkp', 'tax_type', 'tax_rate', 'tax_id_type',
        'tax_id_number', 'gross_amount', 'tax_amount', 'net_amount', 'status', 'transfer_reference', 'transferred_on',
        'entered_by', 'entered_at', 'transferred_by', 'transferred_at',
    ];

    protected $appends = ['tax_type_label'];

    protected function casts(): array
    {
        return [
            'is_individual' => 'boolean',
            'is_pkp' => 'boolean',
            'tax_rate' => 'decimal:2',
            'gross_amount' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'net_amount' => 'decimal:2',
            'transferred_on' => 'date:Y-m-d',
            'entered_at' => 'datetime',
            'transferred_at' => 'datetime',
        ];
    }

    public function getTaxTypeLabelAttribute(): ?string
    {
        return $this->tax_type ? config('marketing.transfer.tax_types.'.$this->tax_type, $this->tax_type) : null;
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(MarketingClaim::class, 'marketing_claim_id');
    }

    public function enterer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'entered_by');
    }

    public function transferer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'transferred_by');
    }
}