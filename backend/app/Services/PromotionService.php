<?php

namespace App\Services;

use App\Models\PromoOfferHistory;
use App\Models\Promotion;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class PromotionService
{
    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Promotion::query();

        if (! empty($filters['promo_type'])) {
            $query->where('promo_type', $filters['promo_type']);
        }

        if (isset($filters['active'])) {
            $query->where('active', (bool) $filters['active']);
        } else {
            $query->where('active', true);
        }

        if (! empty($filters['q'])) {
            $q = $filters['q'];
            $query->where(function ($builder) use ($q) {
                $builder->where('promo_code', 'like', "%{$q}%")
                    ->orWhere('name', 'like', "%{$q}%");
            });
        }

        return $query->orderBy('end_date')->paginate($perPage);
    }

    public function find(int $id): ?Promotion
    {
        return Promotion::with('offerHistories')->find($id);
    }

    public function recordOffer(array $data, User $user): PromoOfferHistory
    {
        return PromoOfferHistory::create([
            'customer_id' => $data['customer_id'],
            'promo_id' => $data['promo_id'],
            'salesperson_id' => $data['salesperson_id'] ?? $user->id,
            'visit_id' => $data['visit_id'] ?? null,
            'offered_at' => $data['offered_at'] ?? now(),
        ]);
    }
}
