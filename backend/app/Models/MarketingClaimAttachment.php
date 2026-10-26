<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketingClaimAttachment extends Model
{
    protected $fillable = ['marketing_claim_id', 'kind', 'path', 'filename', 'mime', 'size'];
}