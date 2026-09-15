<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function login(string $login, string $password): array
    {
        $user = User::query()
            ->where(function ($q) use ($login) {
                $q->where('email', $login)
                    ->orWhere('username', $login)
                    ->orWhere('salesperson_code', $login)
                    ->orWhere('employee_id', $login);
            })
            ->first();

        if (! $user || ! Hash::check($password, $user->password)) {
            throw ValidationException::withMessages([
                'login' => ['Kredensial tidak valid.'],
            ]);
        }

        if (! $user->isActive()) {
            throw ValidationException::withMessages([
                'login' => ['Akun tidak aktif.'],
            ]);
        }

        $user->forceFill(['last_login_at' => now()])->save();
        $token = $user->createToken('api')->plainTextToken;

        $this->auditLogService->log($user->id, 'login', User::class, $user->id);

        return [
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user,
        ];
    }

    public function logout(?User $user = null): void
    {
        $user ??= Auth::user();
        if (! $user) {
            return;
        }

        $user->currentAccessToken()?->delete();
        $this->auditLogService->log($user->id, 'logout', User::class, $user->id);
    }

    public function me(?User $user = null): ?User
    {
        return $user ?? Auth::user();
    }
}
