<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\User;
use App\Models\Visit;
use App\Models\VisitActivity;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Validation\ValidationException;

class VisitService
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Visit::query()->with(['customer', 'salesperson']);

        if (! empty($filters['customer_id'])) {
            $query->where('customer_id', $filters['customer_id']);
        }

        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        return $query->latest('checkin_at')->paginate($perPage);
    }

    public function find(int $id): ?Visit
    {
        return Visit::with(['customer', 'salesperson', 'activities'])->find($id);
    }

    public function checkIn(array $data, User $user): Visit
    {
        $customer = Customer::findOrFail($data['customer_id']);

        if ($customer->latitude === null || $customer->longitude === null) {
            throw ValidationException::withMessages([
                'customer_id' => ['Customer does not have registered coordinates.'],
            ]);
        }

        $distance = $this->haversineMeters(
            (float) $data['latitude'],
            (float) $data['longitude'],
            (float) $customer->latitude,
            (float) $customer->longitude
        );

        $radius = (int) config('canvassing.visit_radius_meters', 500);

        if ($distance > $radius) {
            throw ValidationException::withMessages([
                'location' => [
                    "Check-in ditolak. Jarak {$this->formatDistance($distance)} melebihi radius {$radius} m.",
                ],
            ]);
        }

        $openVisit = Visit::where('customer_id', $customer->id)
            ->where('salesperson_id', $user->id)
            ->whereNotNull('checkin_at')
            ->whereNull('checkout_at')
            ->first();

        if ($openVisit) {
            throw ValidationException::withMessages([
                'customer_id' => ['Ada kunjungan aktif untuk customer ini. Lakukan checkout terlebih dahulu.'],
            ]);
        }

        $visit = Visit::create([
            'customer_id' => $customer->id,
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

        return $visit->load(['customer', 'salesperson', 'activities']);
    }

    public function checkOut(Visit $visit, array $data, User $user): Visit
    {
        if ($visit->checkout_at) {
            throw ValidationException::withMessages([
                'visit' => ['Kunjungan sudah di-checkout.'],
            ]);
        }

        $checkoutAt = now();
        $duration = $visit->checkin_at ? $visit->checkin_at->diffInMinutes($checkoutAt) : null;

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

        return $visit->fresh(['customer', 'salesperson', 'activities']);
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
