<?php
// backend/app/Models/CodeMapping.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Pemetaan kode SKU / Customer aplikasi ke kode di sistem lain (mis. Epicor). */
class CodeMapping extends Model
{
    public const PRODUCT = 'product';

    public const CUSTOMER = 'customer';

    protected $fillable = ['entity_type', 'local_id', 'external_system', 'external_code', 'notes'];
}
