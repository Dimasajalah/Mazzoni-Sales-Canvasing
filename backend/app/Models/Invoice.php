<?php

namespace App\Models;

use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Invoice extends Model
{
    protected $fillable = [
        'invoice_number', 'customer_id', 'sales_order_id', 'invoice_date', 'due_date',
        'invoice_amount', 'paid_amount', 'balance', 'status', 'epicor_invoice_num', 'sync_status',
    ];

    protected function casts(): array
    {
        return [
            'invoice_date' => 'date',
            'due_date' => 'date',
            'invoice_amount' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'balance' => 'decimal:2',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function salesOrder(): BelongsTo
    {
        return $this->belongsTo(SalesOrder::class);
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function daysOverdue(?Carbon $asOf = null): int
    {
        $asOf = ($asOf ?? Carbon::today())->copy()->startOfDay();
        $due = $this->due_date instanceof Carbon
            ? $this->due_date->copy()->startOfDay()
            : Carbon::parse($this->due_date)->startOfDay();

        if ($asOf->lte($due)) {
            return 0;
        }

        return (int) $due->diffInDays($asOf);
    }

    public function agingBucket(?Carbon $asOf = null): string
    {
        $days = $this->daysOverdue($asOf);

        return match (true) {
            $days <= 0 => 'CURRENT',
            $days <= 30 => '1-30',
            $days <= 60 => '31-60',
            default => '60+',
        };
    }
}
