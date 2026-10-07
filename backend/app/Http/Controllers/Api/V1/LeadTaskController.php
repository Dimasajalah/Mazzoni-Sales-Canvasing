<?php
// backend/app/Http/Controllers/Api/V1/LeadTaskController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\Quote;
use App\Services\LeadService;
use App\Services\LeadTaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeadTaskController extends Controller
{
    public function __construct(private readonly LeadTaskService $service, private readonly LeadService $leads)
    {
    }

    /** Tab Activities: daftar tugas + ringkasan (belum dijadwalkan / terlambat / terjadwal). */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $status = strtoupper((string) $request->get('status', 'OPEN'));

        $query = $this->service->visibleTasks($user)
            ->with('lead:id,business_name,owner_name,stage,win_loss,phone,task_set_id,salesperson_id')
            ->when($request->filled('lead_id'), fn ($q) => $q->where('lead_id', $request->get('lead_id')))
            ->when($status !== 'ALL', fn ($q) => $q->where('status', $status))
            // yang sudah terjadwal lebih dulu (paling dekat), yang belum dijadwalkan di bawah
            ->orderByRaw('due_date IS NULL, due_date ASC')
            ->orderByDesc('id');

        return ApiResponse::success([
            'items' => $query->get(),
            'summary' => $this->service->summary($user),
        ]);
    }

    public function forLead(Request $request, int $id): JsonResponse
    {
        $lead = Lead::find($id);
        if (! $lead) {
            return ApiResponse::error('Lead tidak ditemukan', null, 404);
        }

        if (! $this->service->canAccessLead($request->user(), $lead)) {
            return ApiResponse::error('Tidak berhak mengakses lead ini', null, 403);
        }

        return ApiResponse::success($lead->tasks()->get());
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $task = LeadTask::with('lead')->find($id);
        if (! $task) {
            return ApiResponse::error('Tugas tidak ditemukan', null, 404);
        }

        if (! $this->service->canAccessLead($request->user(), $task->lead)) {
            return ApiResponse::error('Tidak berhak mengubah tugas ini', null, 403);
        }

        if (! $task->isOpen()) {
            return ApiResponse::error('Tugas sudah selesai dan tidak bisa diubah', null, 422);
        }

        $data = $request->validate([
            'due_date' => ['nullable', 'date'],
            'remark' => ['nullable', 'string', 'max:500'],
        ]);

        return ApiResponse::success($this->service->updateTask($task, $data), 'Tugas diperbarui');
    }

    /** Konklusi tugas: NEXT (pilih tugas berikutnya), WIN, atau LOSE. */
    public function conclude(Request $request, int $id): JsonResponse
    {
        $task = LeadTask::with('lead')->find($id);
        if (! $task) {
            return ApiResponse::error('Tugas tidak ditemukan', null, 404);
        }

        if (! $this->service->canAccessLead($request->user(), $task->lead)) {
            return ApiResponse::error('Tidak berhak mengubah tugas ini', null, 403);
        }

        $data = $request->validate([
            'conclusion' => ['required', Rule::in(['NEXT', 'WIN', 'LOSE'])],
            'next_template_id' => ['nullable', 'integer', 'exists:task_templates,id'],
            'reason_code' => ['nullable', 'string', 'max:100'],
            'remark' => ['nullable', 'string', 'max:500'],
            'due_date' => ['nullable', 'date'],
        ]);

        $finished = $this->service->conclude($task, $data['conclusion'], $request->user(), $data);
        // Customer terbentuk begitu tugas Brand Awareness selesai dengan Lanjut, dari jalur mana
        // pun (Form Brand maupun Selesaikan Tugas). Idempotent: customer yang sudah ada dipakai.
        if ($data['conclusion'] === 'NEXT' && $task->pipeline_step === 'brand_awareness') {
            $this->leads->ensureCustomer($task->lead);
        }
        // Poin 9: field "Assigned to" perlu nama, bukan cuma id -> ikut dimuat di task yang baru
        // selesai maupun tugas berikutnya.
        $finished->load('assignee:id,name');
        $lead = $finished->lead()->first()->fresh(['currentTask.assignee:id,name']);

        return ApiResponse::success([
            'task' => $finished,
            'next_task' => $lead->currentTask,
            'lead' => $lead,
            'quote' => Quote::where('lead_id', $lead->id)->latest('id')->first(['id', 'quote_number', 'status']),
        ], 'Tugas diselesaikan');
    }
}
