<?php
// backend/app/Models/ProductSample.php

namespace App\Models;

use App\Models\ProductSampleFeedback;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductSample extends Model
{
    protected $fillable = [
        'customer_id', 'lead_id', 'salesperson_id',
        'product_name', 'flavor_variant', 'version', 'qty', 'notes',
    ];

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