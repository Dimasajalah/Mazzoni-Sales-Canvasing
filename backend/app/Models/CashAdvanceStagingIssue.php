<?php
//backend/app/Models/CashAdvanceStagingIssue.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Dokumen Cash Issue versi staging (dipakai sebelum BAQ/penulisan Epicor siap). */
class CashAdvanceStagingIssue extends Model
{
    protected $fillable = [
        'user_id', 'operation_type', 'display_name', 'cash_amount', 'customer_ref', 'comment', 'creation_date', 'attachments',
    ];

    protected $casts = [
        'cash_amount' => 'decimal:2',
        'creation_date' => 'date:Y-m-d',
        'attachments' => 'array',
    ];

    public function cashDocumentNumber(): string
    {
        return 'CD-'.str_pad((string) (7 + $this->id), 4, '0', STR_PAD_LEFT); // lanjut dari CD-0007 pada data contoh FDD
    }
}