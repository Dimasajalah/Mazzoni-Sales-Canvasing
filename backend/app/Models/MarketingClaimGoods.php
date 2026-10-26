<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketingClaimGoods extends Model
{
    protected $table = 'marketing_claim_goods';

    protected $fillable = [
        'marketing_claim_id', 'status', 'set_by', 'set_at', 'stock_available', 'stock_notes', 'stock_checked_by', 'stock_checked_at',
        'requisition_number', 'requisition_by', 'requisition_at', 'received_by', 'received_at', 'shipment_reason_code', 'shipped_by', 'shipped_at',
        'issue_reference', 'issued_by', 'issued_at', 'recipient_name', 'reference', 'handed_over_by', 'handed_over_at',
    ];

    protected function casts(): array
    {
        return [
            'stock_available' => 'boolean',
            'set_at' => 'datetime', 'stock_checked_at' => 'datetime', 'requisition_at' => 'datetime', 'received_at' => 'datetime',
            'shipped_at' => 'datetime', 'issued_at' => 'datetime', 'handed_over_at' => 'datetime',
        ];
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(MarketingClaim::class, 'marketing_claim_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(MarketingClaimGoodsItem::class, 'marketing_claim_goods_id')->orderBy('id');
    }
}