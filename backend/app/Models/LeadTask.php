<?php
// backend/app/Models/LeadTask.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Tugas nyata milik lead, hasil generate dari TaskTemplate. */
class LeadTask extends Model
{
    public const OPEN = 'OPEN';

    public const DONE = 'DONE';

    protected $fillable = [
        'lead_id', 'task_template_id', 'seq', 'name', 'task_type', 'stage', 'pipeline_step',
        'is_closing', 'mandatory', 'actions', 'assigned_to', 'due_date', 'status',
        'pct_complete', 'conclusion', 'reason_code', 'remark', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'is_closing' => 'boolean',
            'mandatory' => 'boolean',
            'actions' => 'array',
            'due_date' => 'date:Y-m-d',
            'completed_at' => 'datetime',
            'pct_complete' => 'integer',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(TaskTemplate::class, 'task_template_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function isOpen(): bool
    {
        return $this->status === self::OPEN;
    }
}
