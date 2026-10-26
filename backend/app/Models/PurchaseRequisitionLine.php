<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseRequisitionLine extends Model
{
    protected $fillable = [
        'purchase_requisition_id', 'line_no', 'part_num', 'requested_part_num', 'description', 'qty', 'unit_price', 'is_asset', 'part_registered',
        'registered_by', 'registered_at',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:2', 'unit_price' => 'decimal:2', 'is_asset' => 'boolean', 'part_registered' => 'boolean', 'registered_at' => 'datetime',
        ];
    }
}