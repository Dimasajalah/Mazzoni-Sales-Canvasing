<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Pemberitahuan uang muka (Petty Cash, Impress Fund Cash Advance) untuk seorang sales. */
class CashAdvanceNotification extends Model
{
    protected $fillable = [
        'doc_key', 'user_id', 'recipient_ref', 'cash_desk_id', 'cash_desk_to', 'cash_desk_to_name',
        'reference_num', 'legal_number', 'apply_date', 'amount', 'currency', 'read_at',
    ];

    protected $casts = [
        'apply_date' => 'date:Y-m-d',
        'amount' => 'decimal:2',
        'read_at' => 'datetime',
    ];
}