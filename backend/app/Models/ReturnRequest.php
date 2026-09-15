<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ReturnRequest extends Model
{
    protected $fillable = [
        'return_number', 'customer_id', 'salesperson_id', 'so_reference', 'reason',
        'condition_notes', 'status', 'rma_number', 'epicor_rma_num', 'client_uuid',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function salesperson(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesperson_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(ReturnRequestLine::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(ReturnAttachment::class);
    }

    public function statusHistories(): HasMany
    {
        return $this->hasMany(ReturnStatusHistory::class);
    }
}
