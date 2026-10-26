<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesAchievementRow extends Model
{
    use HasFactory;

    protected $fillable = ['upload_id', 'period', 'salesperson_id', 'salesperson_code', 'target', 'actual'];

    public function upload(): BelongsTo
    {
        return $this->belongsTo(SalesAchievementUpload::class, 'upload_id');
    }

    public function salesperson(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesperson_id');
    }
}