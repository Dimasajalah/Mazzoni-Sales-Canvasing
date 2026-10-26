<?php
namespace App\Services;

use App\Models\User;

/**
 * Aturan akses bersama untuk data milik sales (order, retur, expense). Peran dan urutan status dibaca dari config/access.php.
 */
class AccessPolicy
{
    // ------------------------------------------------------------ order dan retur

    public function canViewAll(User $user): bool
    {
        if (! config('access.enforce', true)) {
            return true;
        }

        return in_array($user->role, (array) config('access.view_all_roles', []), true);
    }

    public function canChangeReturnStatus(User $user): bool
    {
        if (! config('access.enforce', true)) {
            return true;
        }

        return in_array($user->role, (array) config('access.return_status_roles', []), true);
    }

    /** Pemilik data, atau peran yang boleh melihat semua. */
    public function canAccessOwned(User $user, $ownerId): bool
    {
        return $this->canViewAll($user) || ($ownerId !== null && (int) $ownerId === (int) $user->id);
    }

    /** Filter daftar: peran terbatas selalu dipaksa ke datanya sendiri, parameter dari klien diabaikan. */
    public function scopeFilters(User $user, array $filters): array
    {
        if (! $this->canViewAll($user)) {
            $filters['salesperson_id'] = $user->id;
        }

        return $filters;
    }

    public function returnTransitionAllowed(string $from, string $to): bool
    {
        $map = (array) config('access.return_transitions', []);

        return in_array($to, (array) ($map[$from] ?? []), true);
    }

    // ------------------------------------------------------------ expense

    /** Yang menyetujui atau membayar harus bisa melihat semua expense, jadi mereka otomatis termasuk. */
    public function canViewAllExpenses(User $user): bool
    {
        if (! config('access.enforce', true)) {
            return true;
        }

        $roles = array_merge(
            (array) config('access.view_all_roles', []),
            (array) config('access.expense_approve_roles', []),
            (array) config('access.expense_pay_roles', [])
        );

        return in_array($user->role, $roles, true);
    }

    public function canAccessOwnedExpense(User $user, $ownerId): bool
    {
        return $this->canViewAllExpenses($user) || ($ownerId !== null && (int) $ownerId === (int) $user->id);
    }

    public function scopeExpenseFilters(User $user, array $filters): array
    {
        if (! $this->canViewAllExpenses($user)) {
            $filters['salesperson_id'] = $user->id;
        }

        return $filters;
    }

    /** Menandai PAID butuh peran pembayar; status lain (setujui, tolak) butuh peran penyetuju. */
    public function canSetExpenseStatus(User $user, string $to): bool
    {
        if (! config('access.enforce', true)) {
            return true;
        }

        $roles = $to === 'PAID' ? config('access.expense_pay_roles', []) : config('access.expense_approve_roles', []);

        return in_array($user->role, (array) $roles, true);
    }

    public function expenseTransitionAllowed(string $from, string $to): bool
    {
        $map = (array) config('access.expense_transitions', []);

        return in_array($to, (array) ($map[$from] ?? []), true);
    }

    /** @return array<int, string> Status tujuan yang boleh dipilih pengguna ini dari status sekarang (dipakai layar untuk menampilkan tombol). */
    public function expenseActionsFor(User $user, string $status): array
    {
        $map = (array) config('access.expense_transitions', []);
        $targets = (array) ($map[$status] ?? []);

        return array_values(array_filter($targets, fn ($to) => $this->canSetExpenseStatus($user, $to)));
    }
}