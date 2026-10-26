<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesAchievementUpload extends Model
{
    use HasFactory;

    protected $fillable = ['filename', 'status', 'total_rows', 'error_count', 'errors', 'uploaded_by'];

    protected $casts = ['errors' => 'array'];

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function rows(): HasMany
    {
        return $this->hasMany(SalesAchievementRow::class, 'upload_id');
    }
}