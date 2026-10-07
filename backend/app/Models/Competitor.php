<?php
// backend/app/Models/Competitor.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Competitor extends Model
{
    protected $fillable = ['name', 'address', 'phone', 'email'];
}
