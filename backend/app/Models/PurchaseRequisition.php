<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PurchaseRequisition extends Model
{
    protected $fillable = [
        'pr_no', 'category', 'needed_date', 'is_rab', 'notes', 'status', 'approval_stage', 'approval_round', 'requires_director', 'total_amount',
        'requested_by', 'submitted_at', 'priced_by', 'priced_at', 'dispatch_target', 'dispatched_by', 'dispatched_at',
    ];

    protected $appends = ['category_label', 'dispatch_target_label'];

    protected function casts(): array
    {
        return [
            'needed_date' => 'date:Y-m-d',
            'is_rab' => 'boolean',
            'approval_stage' => 'integer',
            'approval_round' => 'integer',
            'requires_director' => 'boolean',
            'total_amount' => 'decimal:2',
            'submitted_at' => 'datetime',
            'priced_at' => 'datetime',
            'dispatched_at' => 'datetime',
        ];
    }

    public function getCategoryLabelAttribute(): ?string
    {
        return $this->category ? config('marketing.purchase_requisition.categories.'.$this->category, $this->category) : null;
    }

    public function getDispatchTargetLabelAttribute(): ?string
    {
        return $this->dispatch_target ? config('marketing.purchase_requisition.dispatch_targets.'.$this->dispatch_target, $this->dispatch_target) : null;
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(PurchaseRequisitionLine::class)->orderBy('line_no');
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(PurchaseRequisitionAttachment::class)->orderBy('id');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(PurchaseRequisitionApproval::class)->orderBy('id');
    }
}