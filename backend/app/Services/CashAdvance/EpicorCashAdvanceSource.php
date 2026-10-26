<?php
//backend/app/Services/CashAdvance/EpicorCashAdvanceSource.php
namespace App\Services\CashAdvance;

use Illuminate\Support\Facades\Http;

/** Membaca BAQ MZN_CashAdvanceIssued lewat REST Epicor (v2 OData). Pengaturannya ada di config/cash_advance.php dan .env. */
class EpicorCashAdvanceSource implements CashAdvanceSource
{
    public function fetch(): array
    {
        $c = (array) config('cash_advance.epicor');

        $missing = [];
        foreach (['base_url' => 'EPICOR_BASE_URL', 'company' => 'EPICOR_COMPANY', 'api_key' => 'EPICOR_API_KEY', 'username' => 'EPICOR_USERNAME', 'password' => 'EPICOR_PASSWORD'] as $key => $env) {
            if (blank($c[$key] ?? null)) {
                $missing[] = $env;
            }
        }
        if ($missing) {
            throw new \RuntimeException('Pengaturan Epicor belum lengkap di .env: '.implode(', ', $missing));
        }

        $url = rtrim((string) $c['base_url'], '/').'/api/v2/odata/'.rawurlencode((string) $c['company'])
            .'/BaqSvc/'.rawurlencode((string) $c['baq']).'/Data';

        $response = Http::withBasicAuth((string) $c['username'], (string) $c['password'])
            ->withOptions(['verify' => filter_var($c['verify_ssl'] ?? true, FILTER_VALIDATE_BOOLEAN)])
            ->withHeaders(['x-api-key' => (string) $c['api_key']])
            ->acceptJson()
            ->timeout((int) ($c['timeout'] ?? 30))
            ->get($url, ['$top' => (int) ($c['top'] ?? 1000)]);

        if ($response->failed()) {
            throw new \RuntimeException('Epicor menolak permintaan BAQ (HTTP '.$response->status().').');
        }

        $rows = $response->json('value');
        if (! is_array($rows)) {
            throw new \RuntimeException('Respons BAQ Epicor tidak berisi daftar "value".');
        }

        return array_map(fn ($raw) => CashAdvanceRow::normalize((array) $raw), $rows);
    }
}