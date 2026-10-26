<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketingMoveRequestItem extends Model
{
    protected $fillable = ['marketing_move_request_id', 'part_num', 'description', 'qty', 'onhand_qty'];

    protected function casts(): array
    {
        return ['qty' => 'decimal:2', 'onhand_qty' => 'decimal:2'];
    }
}