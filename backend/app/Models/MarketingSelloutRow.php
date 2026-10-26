<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketingSelloutRow extends Model
{
    public $timestamps = false;

    protected $fillable = ['upload_id', 'row_no', 'sale_date', 'customer_id', 'customer_code', 'salesperson_code', 'part_num', 'qty', 'amount'];

    protected function casts(): array
    {
        return ['sale_date' => 'date:Y-m-d', 'qty' => 'decimal:3', 'amount' => 'decimal:2'];
    }
}