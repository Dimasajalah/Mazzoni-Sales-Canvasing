<?php
//backend/app/Services/CashAdvance/PettyCashDashboardService.php
namespace App\Services\CashAdvance;

use App\Models\User;

class PettyCashDashboardService
{
    public function __construct(private readonly ?PettyCashDashboardSource $source = null)
    {
    }

    public function summary(User $user, string $month): array
    {
        $result = $this->source()->summary($this->salesId($user), $month);
        if ($result === null) {
            throw new CashDeskNotConfiguredException();
        }

        return $result;
    }

    public function categories(User $user, string $month): array
    {
        return $this->source()->categories($this->salesId($user), $month);
    }

    public function documents(User $user, string $month, string $direction, ?string $operationType = null): array
    {
        return $this->source()->documents($this->salesId($user), $month, $direction, $operationType);
    }

    private function salesId(User $user): string
    {
        return (string) ($user->username ?: $user->email);
    }

    private function source(): PettyCashDashboardSource
    {
        if ($this->source) {
            return $this->source;
        }

        return config('cash_advance.source') === 'epicor' ? new EpicorPettyCashDashboardSource() : new StagingPettyCashDashboardSource();
    }
}