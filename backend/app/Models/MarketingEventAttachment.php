<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketingEventAttachment extends Model
{
    protected $fillable = ['marketing_event_id', 'path', 'filename', 'mime', 'size'];
}
