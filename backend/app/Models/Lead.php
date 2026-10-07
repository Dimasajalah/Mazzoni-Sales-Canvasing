<?php
//backend/app/Models/Lead.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Storage;

class Lead extends Model
{
    public const STAGES = ['LEAD', 'OPPORTUNITY', 'QUOTE'];

    public const WIN_LOSS = ['OPEN', 'WIN', 'LOSE'];

    /**
     * Revisi pipeline dari transkrip meeting: menggantikan Stage+Status lama secara bertahap.
     * "Lead" = data mentah dari HQ/marketing intelligence (belum ada alurnya di app ini).
     * Pendaftaran sales lewat mobile langsung berstatus Prospek, bukan Lead.
     */
    public const STATUS_LEAD = 'LEAD';

    public const STATUS_PROSPEK = 'PROSPEK';

    public const STATUS_BRAND_AWARENESS = 'BRAND_AWARENESS';

    public const STATUS_SAMPLING = 'SAMPLING';

    public const STATUS_QUOTATION = 'QUOTATION';

    public const STATUS_WIN = 'WIN';

    public const STATUS_LOSE = 'LOSE';

    public const STATUS_DISTRIBUTION = 'DISTRIBUTION';

    public const STATUS_CUSTOMER_VALUES = [
        self::STATUS_LEAD, self::STATUS_PROSPEK, self::STATUS_BRAND_AWARENESS, self::STATUS_SAMPLING,
        self::STATUS_QUOTATION, self::STATUS_WIN, self::STATUS_LOSE, self::STATUS_DISTRIBUTION,
    ];

    /** status_customer -> stage lama (LEAD/OPPORTUNITY/QUOTE), untuk kode yang masih baca `stage`. */
    private const STAGE_BUCKET = [
        self::STATUS_LEAD => 'LEAD', self::STATUS_PROSPEK => 'LEAD', self::STATUS_BRAND_AWARENESS => 'LEAD',
        self::STATUS_SAMPLING => 'OPPORTUNITY',
        self::STATUS_QUOTATION => 'QUOTE', self::STATUS_WIN => 'QUOTE', self::STATUS_DISTRIBUTION => 'QUOTE',
    ];

    protected $attributes = [
        'stage' => 'LEAD',
        'win_loss' => 'OPEN',
        'country' => 'Indonesia',
    ];

    protected $appends = ['store_photo_url'];

    protected $fillable = [
        'business_name',
        'owner_name',
        'address',
        'city',
        'province',
        'postal_code',
        'country',
        'lead_source',
        'phone',
        'email',
        'business_type',
        'npwp',
        'ktp',
        'scoring',
        'win_loss',
        'status_customer',
        'customer_id',
        'closed_at',
        'territory',
        'store_photo_path',
        'task_set_id',
        'task_type_id',
        'task_id',
        'latitude',
        'longitude',
        'salesperson_id',
        'stage',
        'estimated_value',
        'register_date',
        'client_uuid',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
            'estimated_value' => 'decimal:2',
            'register_date' => 'date',
            'closed_at' => 'datetime',
        ];
    }

    /**
     * status_customer adalah satu-satunya field yang di-set langsung oleh kode (LeadService,
     * LeadTaskService, dst). `stage` dan `win_loss` SELALU diturunkan otomatis dari sini, supaya
     * kode lain (DelegationService, NooReportService, SalesOrderController, laporan) yang masih
     * membaca stage/win_loss terus bekerja benar tanpa perlu diubah satu-satu.
     * closed_at tetap mengikuti win_loss seperti sebelumnya (dipakai laporan NOO).
     */
    protected static function booted(): void
    {
        static::saving(function (Lead $lead) {
            if ($lead->isDirty('status_customer')) {
                $status = $lead->status_customer;
                $lead->win_loss = match ($status) {
                    // Distribution = customer aktif repeat order, tahap SETELAH Win — tetap 'WIN'
                    // (closed/menang) untuk kode lama (delegasi, NOO, dsb) yang membaca win_loss.
                    self::STATUS_WIN, self::STATUS_DISTRIBUTION => 'WIN',
                    self::STATUS_LOSE => 'LOSE',
                    default => 'OPEN',
                };

                // Untuk LOSE, stage ikut bucket status SEBELUM kalah (mis. kalah di Sampling
                // tetap tercatat stage OPPORTUNITY), bukan bucket LOSE itu sendiri (LOSE tidak
                // punya bucket stage sendiri).
                $bucketSource = $status === self::STATUS_LOSE
                    ? ($lead->getOriginal('status_customer') ?? self::STATUS_PROSPEK)
                    : $status;
                $lead->stage = self::STAGE_BUCKET[$bucketSource] ?? self::STAGE_BUCKET[self::STATUS_PROSPEK];
            }

            if ($lead->isDirty('status_customer')) {
                $lead->closed_at = $lead->win_loss === 'OPEN' ? null : ($lead->closed_at ?? now());
            } elseif ($lead->isDirty('win_loss')) {
                // Jaga-jaga bila ada kode lama yang masih set win_loss langsung.
                $lead->closed_at = $lead->win_loss === 'OPEN' ? null : ($lead->closed_at ?? now());
            }
        });
    }

    public function delegations(): HasMany
    {
        return $this->hasMany(LeadDelegation::class)->latest('id');
    }

    /** Customer yang otomatis dibuat saat prospek ini "Tertarik" di Brand Awareness. */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function salesperson(): BelongsTo
    {
        return $this->belongsTo(User::class, 'salesperson_id');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(LeadActivity::class);
    }

    public function followups(): HasMany
    {
        return $this->hasMany(LeadFollowup::class);
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

    public function tasks(): HasMany
    {
        return $this->hasMany(LeadTask::class)->orderBy('seq')->orderBy('id');
    }

    /** Tugas aktif terbaru milik lead ini (dipakai daftar Leads & dashboard). */
    public function currentTask(): HasOne
    {
        return $this->hasOne(LeadTask::class)->ofMany(
            ['id' => 'max'],
            fn ($query) => $query->where('status', 'OPEN')
        );
    }

    public function quotes(): HasMany
    {
        return $this->hasMany(Quote::class)->latest('id');
    }

    public function journeyEntries(): HasMany
    {
        return $this->hasMany(LeadJourneyEntry::class)->latest();
    }

    public function getStorePhotoUrlAttribute(): ?string
    {
        return $this->store_photo_path
            ? Storage::disk('public')->url($this->store_photo_path)
            : null;
    }
}