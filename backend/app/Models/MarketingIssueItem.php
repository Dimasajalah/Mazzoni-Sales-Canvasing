<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketingIssueItem extends Model
{
    protected $fillable = ['marketing_issue_id', 'part_num', 'description', 'qty'];

    protected function casts(): array
    {
        return ['qty' => 'decimal:2'];
    }
}