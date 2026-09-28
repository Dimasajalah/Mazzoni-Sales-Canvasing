<?php
// backend/app/Models/ProductSampleFeedback.php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductSampleFeedback extends Model
{
    protected $table = 'product_sample_feedbacks';
    protected $fillable = [
        'product_sample_id', 'customer_id', 'lead_id', 'salesperson_id',
        'version_sample', 'batch_number', 'feedback_type', 'revision_types', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'revision_types' => 'array',
        ];
    }

    public function productSample(): BelongsTo
    {
        return $this->belongsTo(ProductSample::class);
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
}