<?php
// backend/app/Services/DelegationService.php

namespace App\Services;

use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadDelegation;
use App\Models\Notification;
use App\Models\SalesOrder;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Delegasi lead yang sudah Win dari Sales Dealmaker ke Sales Order (poin 11).
 * Dealmaker tidak bisa order, jadi order dibuat oleh sales penerima. NOO tetap dihitung ke pemilik lead (Dealmaker).
 */
class DelegationService
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function delegate(Lead $lead, User $to, User $actor, ?string $note = null): LeadDelegation
    {
        if ($lead->win_loss !== 'WIN') {
            throw ValidationException::withMessages(['lead' => ['Hanya prospek yang sudah Win yang dapat didelegasikan.']]);
        }

        if ($to->role !== 'sales' || $to->sales_type !== User::SALES_ORDER || ! $to->active) {
            throw ValidationException::withMessages(['to_user_id' => ['Tujuan delegasi harus Sales Order yang aktif.']]);
        }

        if (SalesOrder::where('lead_id', $lead->id)->exists()) {
            throw ValidationException::withMessages(['lead' => ['Prospek ini sudah dijadikan order.']]);
        }

        return DB::transaction(function () use ($lead, $to, $actor, $note) {
            // Delegasi lama yang masih menunggu diganti (riwayatnya tetap tersimpan sebagai CANCELLED)
            LeadDelegation::where('lead_id', $lead->id)
                ->where('status', LeadDelegation::PENDING)
                ->update(['status' => LeadDelegation::CANCELLED, 'cancelled_at' => now()]);

            $delegation = LeadDelegation::create([
                'lead_id' => $lead->id,
                'from_user_id' => $actor->id,
                'to_user_id' => $to->id,
                'status' => LeadDelegation::PENDING,
                'note' => $note,
                'delegated_at' => now(),
            ]);

            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $actor->id,
                'activity_type' => 'DELEGATED',
                'notes' => 'Didelegasikan ke '.$to->name.($note ? ' — '.$note : ''),
            ]);

            Notification::create([
                'user_id' => $to->id,
                'title' => 'Delegasi baru: '.$lead->business_name,
                'body' => $actor->name.' mendelegasikan prospek yang sudah Win untuk dibuatkan order.',
                'type' => 'DELEGATION',
                'data' => ['lead_id' => $lead->id, 'delegation_id' => $delegation->id],
            ]);

            $this->auditLogService->log($actor->id, 'lead.delegate', Lead::class, $lead->id, null, $delegation->toArray());

            return $this->hydrate($delegation);
        });
    }

    public function cancel(LeadDelegation $delegation, User $actor): LeadDelegation
    {
        if ($delegation->status !== LeadDelegation::PENDING) {
            throw ValidationException::withMessages(['delegation' => ['Hanya delegasi yang masih menunggu yang dapat dibatalkan.']]);
        }

        $delegation->update(['status' => LeadDelegation::CANCELLED, 'cancelled_at' => now()]);
        $this->auditLogService->log($actor->id, 'lead.delegation_cancel', Lead::class, $delegation->lead_id, null, $delegation->toArray());

        return $this->hydrate($delegation);
    }

    /** Dipanggil saat order dibuat dari prospek: delegasi yang menunggu ditandai selesai. */
    public function markOrdered(int $leadId, SalesOrder $order): void
    {
        LeadDelegation::where('lead_id', $leadId)
            ->where('status', LeadDelegation::PENDING)
            ->update(['status' => LeadDelegation::ORDERED, 'completed_at' => now(), 'order_id' => $order->id]);
    }

    /** Daftar delegasi. Sales hanya melihat yang terkait dirinya; admin/supervisor melihat semua. */
    public function listFor(User $user, array $filters = []): Collection
    {
        $direction = $filters['direction'] ?? null;

        $query = LeadDelegation::query()
            ->with(['lead:id,business_name,owner_name,phone,address', 'lead.quotes:id,lead_id,quote_number,total,status', 'from:id,name', 'to:id,name', 'order:id,order_number'])
            ->when(! empty($filters['status']), fn ($q) => $q->where('status', $filters['status']))
            ->when(! empty($filters['lead_id']), fn ($q) => $q->where('lead_id', $filters['lead_id']))
            ->latest('id');

        if ($user->role === 'sales') {
            $query->where(function ($q) use ($user, $direction) {
                if ($direction === 'incoming') {
                    $q->where('to_user_id', $user->id);
                } elseif ($direction === 'outgoing') {
                    $q->where('from_user_id', $user->id);
                } else {
                    $q->where('to_user_id', $user->id)->orWhere('from_user_id', $user->id);
                }
            });
        }

        return $query->limit(200)->get()->map(fn (LeadDelegation $d) => $this->attachQuote($d));
    }

    /** Delegasi terakhir yang masih berlaku (menunggu / sudah jadi order) untuk sebuah lead. */
    public function latestActive(Lead $lead): ?LeadDelegation
    {
        $d = LeadDelegation::where('lead_id', $lead->id)
            ->whereIn('status', [LeadDelegation::PENDING, LeadDelegation::ORDERED])
            ->latest('id')
            ->first();

        return $d ? $this->hydrate($d) : null;
    }

    public function isDelegate(User $user, Lead $lead, array $statuses = [LeadDelegation::PENDING, LeadDelegation::ORDERED]): bool
    {
        return LeadDelegation::where('lead_id', $lead->id)
            ->where('to_user_id', $user->id)
            ->whereIn('status', $statuses)
            ->exists();
    }

    /** Boleh membuat order atas prospek ini? Pemilik (bukan Dealmaker) atau sales penerima delegasi yang masih menunggu. */
    public function canOrderForLead(User $user, Lead $lead): bool
    {
        if (! $user->canOrder()) {
            return false;
        }

        if ($user->role !== 'sales') {
            return true;
        }

        return $lead->salesperson_id === $user->id
            || $this->isDelegate($user, $lead, [LeadDelegation::PENDING]);
    }

    /** Sales Order aktif yang bisa menjadi tujuan delegasi. */
    public function targets(): Collection
    {
        return User::query()
            ->where('role', 'sales')->where('sales_type', User::SALES_ORDER)->where('active', true)
            ->orderBy('name')
            ->get(['id', 'name', 'territory', 'salesperson_code'])
            ->makeHidden(['can_order', 'can_delegate']);
    }

    private function hydrate(LeadDelegation $d): LeadDelegation
    {
        $d->load(['lead:id,business_name,owner_name,phone,address', 'lead.quotes:id,lead_id,quote_number,total,status', 'from:id,name', 'to:id,name', 'order:id,order_number']);

        return $this->attachQuote($d);
    }

    private function attachQuote(LeadDelegation $d): LeadDelegation
    {
        $d->setRelation('quote', $d->lead?->quotes->first());
        $d->lead?->unsetRelation('quotes');
        $d->from?->makeHidden(['can_order', 'can_delegate']);
        $d->to?->makeHidden(['can_order', 'can_delegate']);

        return $d;
    }
}
