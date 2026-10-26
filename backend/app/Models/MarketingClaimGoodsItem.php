<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketingClaimGoodsItem extends Model
{
    protected $fillable = ['marketing_claim_goods_id', 'part_num', 'description', 'qty'];

    protected function casts(): array
    {
        return ['qty' => 'decimal:2'];
    }
}