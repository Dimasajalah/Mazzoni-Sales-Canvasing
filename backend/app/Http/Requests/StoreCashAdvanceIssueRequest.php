<?php
//backend/app/Http/Requests/StoreCashAdvanceIssueRequest.php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreCashAdvanceIssueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'operation_type' => ['required', 'string'],       // kosong -> E-03
            'display_name' => ['required', 'string'],
            'cash_amount' => ['required', 'integer', 'min:1'], // <=0 -> E-04 (E-05 dicek terpisah vs saldo)
            'customer_ref' => ['nullable', 'string'],
            'comment' => ['required', 'string'],               // kosong -> E-06
            'photos' => ['required', 'array', 'min:1', 'max:3'], // kosong -> E-07, >3 -> E-11
            'photos.*' => ['file', 'mimes:jpg,jpeg,png', 'max:10240'],
        ];
    }

    public function messages(): array
    {
        return [
            'operation_type.required' => 'Pilih kategori pengeluaran.',
            'cash_amount.min' => 'Nominal harus lebih dari Rp 0.',
            'comment.required' => 'Keterangan wajib diisi.',
            'photos.required' => 'Lampirkan minimal 1 foto bukti.',
            'photos.max' => 'Maksimal 3 foto bukti.',
        ];
    }
}