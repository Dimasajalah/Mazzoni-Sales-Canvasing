<?php
// backend/app/Http/Controllers/Api/V1/UserAdminController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Concerns\RequiresManager;
use App\Http\Controllers\Controller;
use App\Models\LeadDelegation;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Manajemen user: admin menentukan peran, dan untuk sales apakah Dealmaker atau Sales Order. */
class UserAdminController extends Controller
{
    use RequiresManager;

    private const ROLES = ['admin', 'supervisor', 'sales', 'finance', 'warehouse'];

    private const COLUMNS = ['id', 'name', 'username', 'email', 'role', 'sales_type', 'territory', 'salesperson_code', 'employee_id', 'active'];

    public function index(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessManager($request)) {
            return $denied;
        }

        $users = User::query()
            ->when($request->filled('role'), fn ($q) => $q->where('role', $request->get('role')))
            ->when($request->filled('q'), fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'like', '%'.$request->get('q').'%')
                ->orWhere('username', 'like', '%'.$request->get('q').'%')))
            ->orderBy('name')
            ->get(self::COLUMNS);

        return ApiResponse::success($users);
    }

    public function store(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessAdmin($request)) {
            return $denied;
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'username' => ['required', 'string', 'max:60', 'unique:users,username'],
            'email' => ['required', 'email', 'max:120', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', Rule::in(self::ROLES)],
            'sales_type' => ['required_if:role,sales', 'nullable', Rule::in(User::SALES_TYPES)],
            'territory' => ['nullable', 'string', 'max:60'],
            'salesperson_code' => ['nullable', 'string', 'max:30', 'unique:users,salesperson_code'],
            'employee_id' => ['nullable', 'string', 'max:30', 'unique:users,employee_id'],
            'active' => ['nullable', 'boolean'],
        ]);

        $data['sales_type'] = $data['role'] === 'sales' ? $data['sales_type'] : User::SALES_ORDER;
        $data['active'] = $data['active'] ?? true;

        $user = User::create($data);

        return ApiResponse::success($user->only(self::COLUMNS), 'User dibuat', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        if ($denied = $this->denyUnlessAdmin($request)) {
            return $denied;
        }

        $user = User::find($id);
        if (! $user) {
            return ApiResponse::error('User tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'email', 'max:120', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', 'string', 'min:8'],
            'role' => ['sometimes', Rule::in(self::ROLES)],
            'sales_type' => ['sometimes', Rule::in(User::SALES_TYPES)],
            'territory' => ['sometimes', 'nullable', 'string', 'max:60'],
            'salesperson_code' => ['sometimes', 'nullable', 'string', 'max:30', Rule::unique('users', 'salesperson_code')->ignore($user->id)],
            'active' => ['sometimes', 'boolean'],
        ]);

        // Admin tidak boleh mengunci dirinya sendiri
        if ($user->id === $request->user()->id
            && (($data['role'] ?? $user->role) !== 'admin' || ($data['active'] ?? $user->active) === false)) {
            return ApiResponse::error('Anda tidak dapat menurunkan peran atau menonaktifkan akun Anda sendiri', null, 422);
        }

        // Sales penerima delegasi tidak boleh berubah peran / nonaktif selama masih ada delegasi menunggu
        $leavingOrderRole = (isset($data['role']) && $data['role'] !== 'sales')
            || (isset($data['sales_type']) && $data['sales_type'] !== User::SALES_ORDER)
            || (isset($data['active']) && $data['active'] === false);
        if ($leavingOrderRole && LeadDelegation::where('to_user_id', $user->id)->where('status', LeadDelegation::PENDING)->exists()) {
            return ApiResponse::error('User ini masih memiliki delegasi yang menunggu dibuatkan order. Batalkan atau alihkan dulu.', null, 422);
        }

        $user->update($data);

        return ApiResponse::success($user->fresh()->only(self::COLUMNS), 'User diperbarui');
    }
}
