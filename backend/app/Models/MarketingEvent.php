<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketingEvent extends Model
{
    /** Status yang budgetnya dihitung sebagai "teralokasi" di Campaign. */
    public const STATUS_COUNTED = ['PENDING_APPROVAL', 'APPROVED'];

    /** Activity Type khusus Program Klaim (MKT04). */
    public const CLAIM_TYPE = 'KLAIM';

    protected $fillable = [
        'marketing_budget_id', 'event_seq', 'description', 'reference_letter_no', 'activity_type',
        'start_date', 'end_date', 'target_type', 'target_territories', 'budget_amount', 'status', 'created_by',
        'claim_type', 'claim_source', 'claim_basis', 'claim_threshold', 'claim_rate', 'claim_rate_type', 'claim_deadline',
        'approval_stage', 'approval_round',
    ];

    protected $appends = ['event_code', 'activity_type_label', 'claim_type_label', 'claim_source_label', 'claim_basis_label'];

    protected function casts(): array
    {
        return [
            'event_seq' => 'integer',
            'approval_stage' => 'integer',
            'approval_round' => 'integer',
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'claim_deadline' => 'date:Y-m-d',
            'target_territories' => 'array',
            'budget_amount' => 'decimal:2',
            'claim_threshold' => 'decimal:2',
            'claim_rate' => 'decimal:2',
        ];
    }

    public function isClaimProgram(): bool
    {
        return $this->activity_type === self::CLAIM_TYPE;
    }

    /** Event: ...-E01, Program Klaim: ...-K02 (urutan nomor dipakai bersama per Campaign). */
    /** Kolom turunan ini aman dipakai walau hanya sebagian kolom yang dipilih (mis. get(['id','status'])): hasilnya null. */
    public function getEventCodeAttribute(): ?string
    {
        if ($this->event_seq === null) {
            return null;
        }

        return ($this->budget->campaign_code ?? '').'-'.($this->isClaimProgram() ? 'K' : 'E').str_pad((string) $this->event_seq, 2, '0', STR_PAD_LEFT);
    }

    public function getActivityTypeLabelAttribute(): ?string
    {
        if ($this->activity_type === null) {
            return null;
        }

        return $this->isClaimProgram() ? 'Klaim' : config('marketing.activity_types.'.$this->activity_type, $this->activity_type);
    }

    public function getClaimTypeLabelAttribute(): ?string
    {
        return $this->claim_type ? config('marketing.claim_types.'.$this->claim_type, $this->claim_type) : null;
    }

    public function getClaimSourceLabelAttribute(): ?string
    {
        return $this->claim_source ? config('marketing.claim_sources.'.$this->claim_source, $this->claim_source) : null;
    }

    public function getClaimBasisLabelAttribute(): ?string
    {
        return $this->claim_basis ? config('marketing.claim_bases.'.$this->claim_basis, $this->claim_basis) : null;
    }

    public function budget(): BelongsTo
    {
        return $this->belongsTo(MarketingBudget::class, 'marketing_budget_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function participants(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'marketing_event_participants', 'marketing_event_id', 'customer_id');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(MarketingEventApproval::class)->orderBy('id');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(MarketingEventAttachment::class);
    }
}