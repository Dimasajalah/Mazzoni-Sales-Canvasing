<?php
//backend/app/Services/VisitService.php
namespace App\Services;

use App\Models\Customer;
use App\Models\Lead;
use App\Models\User;
use App\Models\Visit;
use App\Models\VisitActivity;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

class VisitService
{
    // Poin 9: Visit Mode menampilkan tugas Canvassing lewat jalur ini (bukan LeadService), jadi
    // assignee juga perlu ikut dimuat di sini secara terpisah -> "Assigned to" tetap kosong di
    // Visit Mode walau endpoint /leads sudah benar.
    private const WITH = ['customer', 'lead.currentTask.assignee:id,name', 'salesperson'];

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Visit::query()->with(self::WITH);

        if (! empty($filters['customer_id'])) {
            // Kunjungan yang dilakukan saat masih Lead (customer_id kosong) ikut dihitung ke
            // customer begitu lead itu menjadi customer (leads.customer_id terisi).
            $customerId = $filters['customer_id'];
            $query->where(function ($q) use ($customerId) {
                $q->where('customer_id', $customerId)
                    ->orWhereHas('lead', fn ($l) => $l->where('customer_id', $customerId));
            });
        }
        if (! empty($filters['lead_id'])) {
            $query->where('lead_id', $filters['lead_id']);
        }

        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        return $query->latest('checkin_at')->paginate($perPage);
    }

    public function find(int $id): ?Visit
    {
        return Visit::with([...self::WITH, 'activities'])->find($id);
    }

    /**
     * Check-in sekarang bisa menyasar Customer (perilaku lama) ATAU Lead langsung — lead yang
     * baru didaftarkan belum tentu sudah punya Customer (itu baru terbentuk setelah Brand
     * Awareness dijawab "Tertarik", lihat poin 12). Controller memastikan persis salah satu dari
     * customer_id/lead_id yang terisi sebelum sampai ke sini.
     */
    public function checkIn(array $data, User $user): Visit
    {
        return ! empty($data['lead_id'])
            ? $this->checkInTo('lead_id', Lead::findOrFail($data['lead_id']), $data, $user)
            : $this->checkInTo('customer_id', Customer::findOrFail($data['customer_id']), $data, $user);
    }

    /** @param  Customer|Lead  $target */
    private function checkInTo(string $column, $target, array $data, User $user): Visit
    {
        $field = $column === 'lead_id' ? 'lead_id' : 'customer_id';

        if ($target->latitude === null || $target->longitude === null) {
            throw ValidationException::withMessages([
                $field => ['Lokasi belum terdaftar — koordinat belum diisi.'],
            ]);
        }

        $distance = $this->haversineMeters(
            (float) $data['latitude'],
            (float) $data['longitude'],
            (float) $target->latitude,
            (float) $target->longitude
        );

        $radius = (int) config('canvassing.visit_radius_meters', 500);

        if ($distance > $radius) {
            throw ValidationException::withMessages([
                'location' => [
                    "Check-in ditolak. Jarak {$this->formatDistance($distance)} melebihi radius {$radius} m.",
                ],
            ]);
        }

        $openVisit = Visit::where($field, $target->id)
            ->where('salesperson_id', $user->id)
            ->whereNotNull('checkin_at')
            ->whereNull('checkout_at')
            ->first();

        if ($openVisit) {
            throw ValidationException::withMessages([
                $field => ['Ada kunjungan aktif untuk ini. Lakukan checkout terlebih dahulu.'],
            ]);
        }

        $visit = Visit::create([
            $field => $target->id,
            'salesperson_id' => $user->id,
            'checkin_at' => now(),
            'checkin_latitude' => $data['latitude'],
            'checkin_longitude' => $data['longitude'],
            'checkin_accuracy' => $data['accuracy'] ?? null,
            'checkin_distance' => round($distance, 2),
        ]);

        VisitActivity::create([
            'visit_id' => $visit->id,
            'user_id' => $user->id,
            'activity_type' => 'CHECKIN',
            'notes' => 'Check-in successful',
            'meta' => ['distance' => $visit->checkin_distance, 'radius' => $radius],
        ]);

        $this->auditLogService->log($user->id, 'visit.checkin', Visit::class, $visit->id, null, $visit->toArray());

        return $visit->load([...self::WITH, 'activities']);
    }

    public function checkOut(Visit $visit, array $data, User $user): Visit
    {
        if ($visit->checkout_at) {
            throw ValidationException::withMessages([
                'visit' => ['Kunjungan sudah di-checkout.'],
            ]);
        }

        $checkoutAt = now();
        $duration = $visit->checkin_at ? (int) round($visit->checkin_at->diffInMinutes($checkoutAt)) : null;

        $visit->update([
            'checkout_at' => $checkoutAt,
            'checkout_latitude' => $data['latitude'] ?? null,
            'checkout_longitude' => $data['longitude'] ?? null,
            'duration_minutes' => $duration,
            'visit_result' => $data['visit_result'] ?? null,
            'notes' => $data['notes'] ?? $visit->notes,
        ]);

        VisitActivity::create([
            'visit_id' => $visit->id,
            'user_id' => $user->id,
            'activity_type' => 'CHECKOUT',
            'notes' => $data['notes'] ?? null,
            'meta' => ['visit_result' => $visit->visit_result],
        ]);

        $this->auditLogService->log($user->id, 'visit.checkout', Visit::class, $visit->id, null, $visit->fresh()->toArray());

        return $visit->fresh([...self::WITH, 'activities']);
    }

    public function haversineMeters(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $earthRadius = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadius * $c;
    }

    protected function formatDistance(float $meters): string
    {
        return number_format($meters, 0, ',', '.') . ' m';
    }
}