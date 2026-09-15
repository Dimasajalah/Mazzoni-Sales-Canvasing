<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadFollowup;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;

class LeadService
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        $query = Lead::query()->with(['salesperson', 'followups']);

        if (! empty($filters['stage'])) {
            $query->where('stage', $filters['stage']);
        }

        if (! empty($filters['salesperson_id'])) {
            $query->where('salesperson_id', $filters['salesperson_id']);
        }

        if (! empty($filters['q'])) {
            $q = $filters['q'];
            $query->where(function ($builder) use ($q) {
                $builder->where('business_name', 'like', "%{$q}%")
                    ->orWhere('owner_name', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%");
            });
        }

        return $query->latest()->paginate($perPage);
    }

    public function find(int $id): ?Lead
    {
        return Lead::with(['salesperson', 'activities', 'followups'])->find($id);
    }

    public function create(array $data, User $user): Lead
    {
        if (! empty($data['client_uuid'])) {
            $existing = Lead::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return $existing->load(['salesperson', 'activities', 'followups']);
            }
        }

        $lead = Lead::create([
            ...$data,
            'salesperson_id' => $data['salesperson_id'] ?? $user->id,
            'stage' => $data['stage'] ?? 'NEW',
            'register_date' => $data['register_date'] ?? now()->toDateString(),
            'client_uuid' => $data['client_uuid'] ?? (string) Str::uuid(),
        ]);

        LeadActivity::create([
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'activity_type' => 'CREATED',
            'notes' => 'Lead registered',
            'to_stage' => $lead->stage,
        ]);

        $this->auditLogService->log($user->id, 'lead.create', Lead::class, $lead->id, null, $lead->toArray());

        return $lead->load(['salesperson', 'activities', 'followups']);
    }

    public function update(Lead $lead, array $data, User $user): Lead
    {
        $oldStage = $lead->stage;
        $old = $lead->toArray();
        $lead->update($data);

        if (isset($data['stage']) && $data['stage'] !== $oldStage) {
            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $user->id,
                'activity_type' => 'STAGE_CHANGE',
                'from_stage' => $oldStage,
                'to_stage' => $lead->stage,
                'notes' => $data['notes'] ?? null,
            ]);
        }

        $this->auditLogService->log($user->id, 'lead.update', Lead::class, $lead->id, $old, $lead->fresh()->toArray());

        return $lead->fresh(['salesperson', 'activities', 'followups']);
    }

    public function delete(Lead $lead, User $user): void
    {
        $this->auditLogService->log($user->id, 'lead.delete', Lead::class, $lead->id, $lead->toArray());
        $lead->delete();
    }

    public function scheduleFollowup(Lead $lead, array $data, User $user): LeadFollowup
    {
        return LeadFollowup::create([
            'lead_id' => $lead->id,
            'salesperson_id' => $data['salesperson_id'] ?? $user->id,
            'followup_at' => $data['followup_at'],
            'notes' => $data['notes'] ?? null,
            'status' => 'PENDING',
        ]);
    }
}
