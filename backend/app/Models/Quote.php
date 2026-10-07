<?php
// backend/app/Models/Quote.php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Quote extends Model
{
    public const DRAFT = 'DRAFT';

    public const QUOTED = 'QUOTED';

    public const WON = 'WON';

    public const LOST = 'LOST';

    protected $fillable = [
        'quote_number', 'lead_id', 'customer_id', 'product_sample_id', 'salesperson_id', 'status', 'currency',
        'customer_po', 'entry_date', 'due_date', 'expected_close_date', 'follow_up_date', 'expires_at',
        'quoted', 'quoted_at', 'terms', 'payment_term', 'notes', 'subtotal', 'discount_total', 'total',
        'epicor_quote_num', 'sync_status', 'client_uuid',
    ];

    protected function casts(): array
    {
        return [
            'entry_date' => 'date:Y-m-d',
            'due_date' => 'date:Y-m-d',
            'expected_close_date' => 'date:Y-m-d',
            'follow_up_date' => 'date:Y-m-d',
            'expires_at' => 'date:Y-m-d',
            'quoted' => 'boolean',
            'quoted_at' => 'datetime',
            'subtotal' => 'decimal:2',
            'discount_total' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    public function isClosed(): bool
    {
        return in_array($this->status, [self::WON, self::LOST], true);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function salesperson(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesperson_id');
    }

    public function sample(): BelongsTo
    {
        return $this->belongsTo(ProductSample::class, 'product_sample_id');
    }

    /**
     * Poin 21: product group untuk filter pencarian produk di Quotation. Dibuat sebagai ACCESSOR
     * (bukan properti biasa) supaya tidak pernah ikut ter-dirty-kan/disimpan saat update() lain
     * dipanggil pada quote yang sama — accessor murni dihitung saat dibaca, tidak pernah masuk ke
     * $attributes. Sengaja TIDAK didaftarkan ke $appends (supaya endpoint daftar quote tidak kena
     * query tambahan per baris); cuma di-append secara eksplisit di QuoteService::find().
     *
     * Sample resmi (ProductSample, poin 9) TIDAK selalu ada — alur yang paling umum (Feedback
     * Sample, poin 12) cuma membuat ProductSampleFeedback, tidak pernah membuat ProductSample sama
     * sekali — jadi dicari dari sumber manapun yang tersedia untuk lead ini.
     */
    protected function sampleProductGroup(): Attribute
    {
        return Attribute::make(
            get: function () {
                if ($this->sample?->product_group) {
                    return $this->sample->product_group;
                }

                if (! $this->lead_id) {
                    return null;
                }

                return ProductSampleFeedback::where('lead_id', $this->lead_id)->latest('id')->value('product_group')
                    ?? ProductSample::where('lead_id', $this->lead_id)->latest('id')->value('product_group');
            },
        );
    }

    public function lines(): HasMany
    {
        return $this->hasMany(QuoteLine::class)->orderBy('id');
    }

    /** Order yang dibuat dari penawaran ini (satu penawaran = satu order). */
    public function order(): HasOne
    {
        return $this->hasOne(SalesOrder::class, 'quote_id');
    }

    public function competitors(): HasMany
    {
        return $this->hasMany(QuoteCompetitor::class)->with('competitor');
    }
}
