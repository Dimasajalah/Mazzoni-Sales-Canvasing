<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseRequisitionAttachment extends Model
{
    protected $fillable = ['purchase_requisition_id', 'kind', 'path', 'filename', 'mime', 'size'];
}