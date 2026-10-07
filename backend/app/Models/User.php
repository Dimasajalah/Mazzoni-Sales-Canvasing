<?php
// backend/app/Models/User.php
namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = [
        'employee_id',
        'salesperson_code',
        'name',
        'email',
        'username',
        'password',
        'role',
        'sales_type',
        'territory',
        'active',
        'last_login_at',
    ];

    public const SALES_DEALMAKER = 'DEALMAKER';

    public const SALES_ORDER = 'ORDER';

    public const SALES_TYPES = [self::SALES_DEALMAKER, self::SALES_ORDER];

    /** Ikut tampil di respons login / me agar aplikasi bisa menyembunyikan menu sesuai peran. */
    protected $appends = ['can_order', 'can_delegate'];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'password' => 'hashed',
            'active' => 'boolean',
        ];
    }

    /** Sales Dealmaker: NOO, kunjungan, sample, negosiasi, delegasi. Tidak bisa order. */
    public function isDealmaker(): bool
    {
        return $this->role === 'sales' && $this->sales_type === self::SALES_DEALMAKER;
    }

    public function canOrder(): bool
    {
        return ! $this->isDealmaker();
    }

    /** Delegasi dilakukan Dealmaker; admin/supervisor boleh mengatur ulang. Sales Order tidak bisa mendelegasikan. */
    public function canDelegate(): bool
    {
        return $this->isDealmaker() || in_array($this->role, ['admin', 'supervisor'], true);
    }

    // null bila kolom peran tidak dimuat (relasi user yang hanya memilih id/name), agar tidak menyesatkan
    public function getCanOrderAttribute(): ?bool
    {
        return $this->rolesLoaded() ? $this->canOrder() : null;
    }

    public function getCanDelegateAttribute(): ?bool
    {
        return $this->rolesLoaded() ? $this->canDelegate() : null;
    }

    private function rolesLoaded(): bool
    {
        return array_key_exists('role', $this->attributes) && array_key_exists('sales_type', $this->attributes);
    }

    public function customers(): HasMany
    {
        return $this->hasMany(Customer::class, 'salesperson_id');
    }

    public function leads(): HasMany
    {
        return $this->hasMany(Lead::class, 'salesperson_id');
    }

    public function visits(): HasMany
    {
        return $this->hasMany(Visit::class, 'salesperson_id');
    }

    public function salesOrders(): HasMany
    {
        return $this->hasMany(SalesOrder::class, 'salesperson_id');
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class, 'salesperson_id');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function isActive(): bool
    {
        return (bool) $this->active;
    }
}
