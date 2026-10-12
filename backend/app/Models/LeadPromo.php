<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Promo yang di-Apply untuk sebuah prospek (dokumen hal. 36). */
class LeadPromo extends Model
{
    protected $fillable = ['lead_id', 'promo_ref', 'promo_name', 'applied_by'];
}