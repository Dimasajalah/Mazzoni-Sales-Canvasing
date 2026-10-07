<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Expense;
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
    public function __construct(
        private readonly ARDataProviderInterface $arProvider,
        private readonly LeadTaskService $leadTaskService,
    ) {
    }

    public function summary(User $user): array
    {
        $aging = $this->arProvider->agingSummary();
        $topAging = $this->arProvider->agingInvoices()->take(10)->values();

        // Pipeline 7 langkah (Prospek, Lead, Brand Awareness, Sampling, Quote, Win, Lose)
        $pipeline = $this->leadTaskService->pipelineCounts($user);

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
            'activities' => $this->leadTaskService->summary($user),
            'active_promos' => Promotion::where('active', true)
                ->where(function ($q) use ($today) {
                    $q->whereNull('end_date')->orWhere('end_date', '>=', $today);
                })
                ->orderBy('end_date')
                ->limit(5)
                ->get(),
            'unread_notifications' => $user->notifications()->whereNull('read_at')->count(),
            // Delegasi yang menunggu: masuk (untuk Sales Order) dan keluar (untuk Dealmaker)
            'delegations' => [
                'incoming_pending' => \App\Models\LeadDelegation::where('to_user_id', $user->id)->where('status', 'PENDING')->count(),
                'outgoing_pending' => \App\Models\LeadDelegation::where('from_user_id', $user->id)->where('status', 'PENDING')->count(),
            ],
        ];
    }
}
