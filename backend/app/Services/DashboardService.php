<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Lead;
use App\Models\Promotion;
use App\Models\ReturnRequest;
use App\Models\SalesOrder;
use App\Models\User;
use App\Models\Visit;
use App\Providers\Data\Contracts\ARDataProviderInterface;
use Carbon\Carbon;

class DashboardService
{
    public function __construct(private readonly ARDataProviderInterface $arProvider)
    {
    }

    public function summary(User $user): array
    {
        $aging = $this->arProvider->agingSummary();
        $topAging = $this->arProvider->agingInvoices()->take(10)->values();

        $pipeline = Lead::query()
            ->selectRaw('stage, COUNT(*) as total')
            ->when($user->role === 'sales', fn ($q) => $q->where('salesperson_id', $user->id))
            ->groupBy('stage')
            ->pluck('total', 'stage');

        $today = Carbon::today();

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'territory' => $user->territory,
                'salesperson_code' => $user->salesperson_code,
            ],
            'stats' => [
                'customers' => Customer::when($user->role === 'sales', fn ($q) => $q->where('salesperson_id', $user->id))->count(),
                'leads' => Lead::when($user->role === 'sales', fn ($q) => $q->where('salesperson_id', $user->id))->count(),
                'orders' => SalesOrder::when($user->role === 'sales', fn ($q) => $q->where('salesperson_id', $user->id))->count(),
                'visits_today' => Visit::whereDate('checkin_at', $today)
                    ->when($user->role === 'sales', fn ($q) => $q->where('salesperson_id', $user->id))
                    ->count(),
                'open_expenses' => Expense::whereIn('status', ['SUBMITTED', 'APPROVED'])
                    ->when($user->role === 'sales', fn ($q) => $q->where('salesperson_id', $user->id))
                    ->count(),
                'open_returns' => ReturnRequest::whereIn('status', ['SUBMITTED', 'VERIFIED', 'APPROVED'])
                    ->when($user->role === 'sales', fn ($q) => $q->where('salesperson_id', $user->id))
                    ->count(),
            ],
            'ar' => $aging,
            'top_aging' => $topAging,
            'pipeline' => $pipeline,
            'active_promos' => Promotion::where('active', true)
                ->where(function ($q) use ($today) {
                    $q->whereNull('end_date')->orWhere('end_date', '>=', $today);
                })
                ->orderBy('end_date')
                ->limit(5)
                ->get(),
            'unread_notifications' => $user->notifications()->whereNull('read_at')->count(),
        ];
    }
}
