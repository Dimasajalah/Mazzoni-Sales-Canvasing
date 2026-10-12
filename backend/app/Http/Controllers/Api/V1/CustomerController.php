<?php
//backend/app/Http/Controllers/Api/V1/CustomerController.php
namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\CustomerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function __construct(private readonly CustomerService $customerService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['q', 'salesperson_id', 'active']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->customerService->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_code' => ['required', 'string', 'max:50', 'unique:customers,customer_code'],
            'name' => ['required', 'string', 'max:255'],
            'customer_group' => ['nullable', 'string'],
            'grade' => ['nullable', 'string'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'npwp' => ['nullable', 'string'],
            'sales_notes' => ['nullable', 'string', 'max:5000'],
            'credit_limit' => ['nullable', 'numeric'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'salesperson_id' => ['nullable', 'exists:users,id'],
            'active' => ['nullable', 'boolean'],
        ]);

        $customer = $this->customerService->create($data, $request->user()->id);

        return ApiResponse::success($customer, 'Customer berhasil dibuat', 201);
    }

    public function show(int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        $customer->load('lead.currentTask.assignee:id,name');

        return ApiResponse::success($customer);
    }

    /** Log aktivitas customer (dokumen hal. 18). ?limit=10 (bawaan), maksimum 1000. */
    public function activity(Request $request, int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        $limit = max(1, min(1000, (int) $request->get('limit', 10)));

        return ApiResponse::success($this->customerService->activityLog($customer, $limit));
    }

    /** Calon penerima serah-terima PIC (dokumen hal. 20): sales aktif selain PIC saat ini. */
    public function picTargets(int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        return ApiResponse::success(
            User::query()
                ->where('active', true)
                ->where('role', 'sales')
                ->where('id', '!=', (int) $customer->salesperson_id)
                ->orderBy('name')
                ->get(['id', 'name', 'salesperson_code', 'territory'])
        );
    }

    /** Menyerahkan PIC customer ke sales lain. Hanya PIC saat ini, supervisor, atau admin. */
    public function delegatePic(Request $request, int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        $user = $request->user();
        $isManager = in_array($user->role, ['admin', 'supervisor'], true);
        if (! $isManager && (int) $customer->salesperson_id !== (int) $user->id) {
            return ApiResponse::error('Hanya PIC saat ini, supervisor, atau admin yang dapat menyerahkan customer ini', null, 403);
        }

        $data = $request->validate(['to_user_id' => ['required', 'integer', 'exists:users,id']]);

        $target = User::query()->where('id', $data['to_user_id'])->where('active', true)->where('role', 'sales')->first();
        if (! $target) {
            return ApiResponse::error('Sales tujuan tidak valid', null, 422);
        }
        if ((int) $target->id === (int) $customer->salesperson_id) {
            return ApiResponse::error('Customer sudah berada di bawah sales ini', null, 422);
        }

        return ApiResponse::success(
            $this->customerService->delegatePic($customer, $target, $user),
            'PIC customer dipindahkan'
        );
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        $data = $request->validate([
            'customer_code' => ['sometimes', 'string', 'max:50', 'unique:customers,customer_code,'.$customer->id],
            'name' => ['sometimes', 'string', 'max:255'],
            'customer_group' => ['nullable', 'string'],
            'grade' => ['nullable', 'string'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string'],
            'phone' => ['nullable', 'string'],
            'email' => ['nullable', 'email'],
            'npwp' => ['nullable', 'string'],
            'sales_notes' => ['nullable', 'string', 'max:5000'],
            'credit_limit' => ['nullable', 'numeric'],
            'latitude' => ['nullable', 'numeric'],
            'longitude' => ['nullable', 'numeric'],
            'salesperson_id' => ['nullable', 'exists:users,id'],
            'active' => ['nullable', 'boolean'],
        ]);

        return ApiResponse::success(
            $this->customerService->update($customer, $data, $request->user()->id),
            'Customer diperbarui'
        );
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $customer = $this->customerService->find($id);
        if (! $customer) {
            return ApiResponse::error('Customer tidak ditemukan', null, 404);
        }

        $this->customerService->delete($customer, $request->user()->id);

        return ApiResponse::success(null, 'Customer dihapus');
    }
}
