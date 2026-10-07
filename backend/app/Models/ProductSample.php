<?php
// backend/app/Models/ProductSample.php

namespace App\Models;

use App\Models\ProductSampleFeedback;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductSample extends Model
{
    public const STATUS_PENDING = 'PENDING';

    public const STATUS_DELIVERED = 'DELIVERED';

    protected $fillable = [
        'customer_id', 'lead_id', 'lead_task_id', 'salesperson_id',
        'product_name', 'product_group', 'flavor_variant', 'version', 'qty', 'batch_number', 'notes',
        'status', 'delivered_at',
    ];

    protected $attributes = [
        'status' => self::STATUS_PENDING,
    ];

    protected function casts(): array
    {
        return ['delivered_at' => 'datetime'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function salesperson(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesperson_id');
    }

    public function feedbacks(): HasMany
    {
        return $this->hasMany(ProductSampleFeedback::class);
    }
}