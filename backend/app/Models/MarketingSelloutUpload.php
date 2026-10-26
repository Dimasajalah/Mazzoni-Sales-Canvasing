<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketingSelloutUpload extends Model
{
    protected $fillable = [
        'marketing_event_id', 'filename', 'status', 'total_rows', 'error_count', 'errors', 'total_qty', 'total_amount', 'uploaded_by',
    ];

    protected function casts(): array
    {
        return [
            'total_rows' => 'integer',
            'error_count' => 'integer',
            'errors' => 'array',
            'total_qty' => 'decimal:3',
            'total_amount' => 'decimal:2',
        ];
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function rows(): HasMany
    {
        return $this->hasMany(MarketingSelloutRow::class, 'upload_id');
    }
}