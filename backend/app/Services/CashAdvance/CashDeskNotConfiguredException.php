<?php
//backend/app/Services/CashAdvance/CashDeskNotConfiguredException.php
namespace App\Services\CashAdvance;

use RuntimeException;

/** Sales ID belum punya Petty Cash Desk di UD02_BMT_SalesCashDesk — FDD pesan sistem E-01. */
class CashDeskNotConfiguredException extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('Akun Cash Advance Anda belum disiapkan. Hubungi Finance.');
    }
}