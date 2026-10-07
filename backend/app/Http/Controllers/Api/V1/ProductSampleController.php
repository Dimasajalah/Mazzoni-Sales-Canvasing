<?php
// backend/app/Http/Controllers/Api/V1/ProductSampleController.php

namespace App\Http\Controllers\Api\V1;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Services\LeadService;
use App\Services\ProductSampleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductSampleController extends Controller
{
    public function __construct(
        private readonly ProductSampleService $service,
        private readonly LeadService $leads,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only(['customer_id', 'lead_id', 'lead_task_id', 'salesperson_id']);
        if ($request->user()->role === 'sales' && empty($filters['salesperson_id'])) {
            $filters['salesperson_id'] = $request->user()->id;
        }

        return ApiResponse::success($this->service->list($filters, (int) $request->get('per_page', 20)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'exists:customers,id'],
            'lead_id' => ['nullable', 'exists:leads,id'],
            'lead_task_id' => ['nullable', 'exists:lead_tasks,id'],
            'product_name' => ['nullable', 'string', 'max:255'],
            'product_group' => ['required', 'string', 'max:100'],
            'qty' => ['required', 'integer', 'min:1'], // gram
            'batch_number' => ['required', 'string', 'max:100'],
            'flavor_variant' => ['nullable', 'in:BBQ,Red Hot,Mayonaise'],
            'version' => ['nullable', 'integer', 'min:1'],
            'notes' => ['nullable', 'string'],
        ]);

        $sample = $this->service->create($data, $request->user());

        return ApiResponse::success($sample, 'Pengajuan sample berhasil dicatat', 201);
    }

    public function show(int $id): JsonResponse
    {
        $sample = $this->service->find($id);
        if (! $sample) {
            return ApiResponse::error('Data sample tidak ditemukan', null, 404);
        }

        return ApiResponse::success($sample);
    }

    /** Poin 9: tandai sample sudah diberikan ke customer. Idempotent — aman ditekan berkali-kali. */
    public function deliver(int $id): JsonResponse
    {
        $sample = $this->service->find($id);
        if (! $sample) {
            return ApiResponse::error('Data sample tidak ditemukan', null, 404);
        }

        if ($sample->status !== \App\Models\ProductSample::STATUS_DELIVERED) {
            $sample->update([
                'status' => \App\Models\ProductSample::STATUS_DELIVERED,
                'delivered_at' => now(),
            ]);
        }

        return ApiResponse::success($sample->fresh(), 'Sample ditandai sudah diberikan');
    }

    public function feedbackIndex(Request $request): JsonResponse
    {
        $filters = $request->only(['product_sample_id', 'customer_id', 'feedback_type']);

        return ApiResponse::success($this->service->listFeedbacks($filters, (int) $request->get('per_page', 20)));
    }

    public function feedbackStore(Request $request): JsonResponse
    {
        // Form Feedback Sample (poin 10, hasil meeting Okt 2026): Product Group, Qty (Gram),
        // Batch, Tempat Simpan. Keterangan wajib begitu salah satu indikator kualitas "Tidak Oke"
        // (feedback_type selain interest). Version Sample lama dipertahankan opsional.
        $data = $request->validate([
            'product_sample_id' => ['nullable', 'exists:product_samples,id'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'lead_id' => ['nullable', 'exists:leads,id'],
            'lead_task_id' => ['nullable', 'exists:lead_tasks,id'],
            'product_group' => ['required', 'string', 'max:100'],
            'qty' => ['required', 'integer', 'min:1'], // gram
            'batch_number' => ['required', 'string', 'max:100'],
            'storage_location' => ['nullable', 'string', 'max:100'],
            'version_sample' => ['nullable', 'integer', 'min:1'],
            // Form baru tidak mengirim feedback_type (hasil ditentukan Conclusion + Reason Code);
            // tetap diterima untuk klien lama.
            'feedback_type' => ['nullable', 'in:interest,not_interest,revision'],
            'revision_types' => ['nullable', 'required_if:feedback_type,revision', 'array'],
            'revision_types.*' => ['in:warna,tekstur,bau,rasa'],
            // Keterangan wajib bila hasilnya tidak oke: ada Jenis Revisi yang dipilih, atau klien lama
            // mengirim not_interest/revision.
            'notes' => ['nullable', 'string', 'required_with:revision_types', 'required_if:feedback_type,not_interest,revision'],
            // Revisi tim functional: Conclusion & Reason Code dipilih manual oleh sales -> lihat
            // catatan yang sama di LeadJourneyController::store().
            'manual_conclude' => ['nullable', 'boolean'],
        ]);

        $feedback = $this->service->recordFeedback($data, $request->user());
        // Hasil sample menggerakkan status_customer (poin 10 & 11): Interest -> Quotation,
        // Not Interest -> Lose, Revision -> tetap di Sampling. Hanya bila feedback terkait sebuah lead.
        $lead = null;
        if (! empty($data['lead_id'])) {
            $lead = Lead::find($data['lead_id']);
            if ($lead) {
                // Tanpa feedback_type (form baru), hasil ditentukan sales lewat Conclusion + Reason Code,
                // jadi penyelesaian tugas otomatis selalu dilewati.
                $feedbackType = $data['feedback_type'] ?? null;
                $lead = $this->leads->resolveSampleFeedback(
                    $lead, $feedbackType, $request->user(), $data['lead_task_id'] ?? null,
                    ($data['manual_conclude'] ?? false) || $feedbackType === null
                );
            }
        }

        return ApiResponse::success(['feedback' => $feedback, 'lead' => $lead], 'Feedback sample berhasil dicatat', 201);
    }
}
