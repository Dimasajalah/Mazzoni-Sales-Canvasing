<?php
// backend/app/Models/TaskTemplate.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Satu langkah dalam template Task Set (mis. B2B seq 40 "Pengajuan Sample"). */
class TaskTemplate extends Model
{
    protected $fillable = [
        'task_set_id', 'seq', 'name', 'task_type', 'stage', 'required_role',
        'mandatory', 'needs_schedule', 'is_closing', 'actions', 'pipeline_step', 'active',
    ];

    protected function casts(): array
    {
        return [
            'mandatory' => 'boolean',
            'needs_schedule' => 'boolean',
            'is_closing' => 'boolean',
            'active' => 'boolean',
            'actions' => 'array',
        ];
    }

    public function taskSet(): BelongsTo
    {
        return $this->belongsTo(TaskSet::class);
    }
}
