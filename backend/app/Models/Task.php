<?php
// backend/app/Models/Task.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Task extends Model
{
    protected $fillable = ['task_type_id', 'code', 'name', 'active', 'mandatory'];

    protected function casts(): array
    {
        return ['active' => 'boolean', 'mandatory' => 'boolean'];
    }

    public function taskType(): BelongsTo
    {
        return $this->belongsTo(TaskType::class);
    }
}
