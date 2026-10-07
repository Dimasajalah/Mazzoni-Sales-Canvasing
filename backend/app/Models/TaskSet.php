<?php
// backend/app/Models/TaskSet.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TaskSet extends Model
{
    protected $fillable = ['code', 'name', 'active'];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function templates(): HasMany
    {
        return $this->hasMany(TaskTemplate::class)->where('active', true)->orderBy('seq');
    }
}
