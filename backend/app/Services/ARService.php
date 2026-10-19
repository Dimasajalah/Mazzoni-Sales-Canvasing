<?php
//backend/app/Services/ARService.php
namespace App\Services;

use App\Helpers\Aging;
use App\Models\Invoice;
use App\Models\User;
use App\Providers\Data\Contracts\ARDataProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ARService
{
    public function __construct(private readonly ARDataProviderInterface $provider)
    {
    }

    public function invoices(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        return $this->provider->invoices($filters, $perPage);
    }

    public function findInvoice(int $id): ?Invoice
    {
        return $this->provider->findInvoice($id);
    }

    /** Aging satu customer (atau semua bila customerId kosong), tanpa pembatas per sales. */
    public function aging(?int $customerId = null, ?string $bucket = null): array
    {
        return [
            'summary' => $this->provider->agingSummary($customerId),
            'invoices' => $this->provider->agingInvoices($customerId, $bucket),
        ];
    }

    /**
     * Laporan piutang untuk satu pengguna: sales hanya melihat customer miliknya.
     * Ringkasan dihitung dari semua invoice yang terlihat, sedangkan daftar invoice bisa disaring per bucket.
     */
    public function portfolio(User $user, ?string $bucket = null): array
    {
        $invoices = Aging::visibleTo($this->provider->agingInvoices(), $user);
        $summary = Aging::summarize($invoices);

        if ($bucket && $bucket !== 'ALL') {
            $invoices = $invoices->filter(fn (Invoice $invoice) => $invoice->aging_bucket === $bucket)->values();
        }

        return [
            'as_of' => now()->toIso8601String(),
            'summary' => $summary,
            'invoices' => $invoices->map(fn (Invoice $invoice) => Aging::payload($invoice))->values(),
        ];
    }
}