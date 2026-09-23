<?php
// backend/app/Models/LeadFollowup.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadFollowup extends Model
{
    protected $fillable = [
        'lead_id',
        'salesperson_id',
        'task_set_id',
        'task_type_id',
        'task_id',
        'followup_at',
        'notes',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'followup_at' => 'datetime',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function salesperson(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesperson_id');
    }

    public function taskSet(): BelongsTo
    {
        return $this->belongsTo(TaskSet::class);
    }

    public function taskType(): BelongsTo
    {
        return $this->belongsTo(TaskType::class);
    }

    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }
}