<?php

namespace App\Services\Epicor;

use Illuminate\Support\Facades\Log;
use RuntimeException;

/** Memanggil Epicor Function (EFx) lewat REST v2. Pola curl sama dengan EpicorClient. */
class EpicorFunctionClient
{
    public function call(string $library, string $function, array $payload): array
    {
        $base = rtrim((string) config('services.epicor.base_url'), '/');
        $company = (string) config('services.epicor.company');
        if ($base === '' || $company === '') {
            throw new RuntimeException('Konfigurasi Epicor belum lengkap. Cek EPICOR_BASE_URL dan EPICOR_COMPANY di .env');
        }

        // Pola URL EFx: verifikasi di REST Help / Swagger environment Epicor Anda.
        $url = "{$base}/api/v2/efx/{$company}/{$library}/{$function}";
        $verify = (bool) config('services.epicor.verify_ssl', true);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($payload),
            CURLOPT_HTTPAUTH => CURLAUTH_BASIC,
            CURLOPT_USERPWD => config('services.epicor.username').':'.config('services.epicor.password'),
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'Content-Type: application/json',
                'X-API-Key: '.config('services.epicor.api_key'),
            ],
            CURLOPT_SSL_VERIFYPEER => $verify,
            CURLOPT_SSL_VERIFYHOST => $verify ? 2 : 0,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 45,
        ]);

        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errno = curl_errno($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false || $errno !== 0) {
            Log::error('Epicor EFx call failed (curl)', ['fn' => "$library/$function", 'errno' => $errno, 'error' => $error]);
            throw new RuntimeException("Epicor Function '{$function}' gagal koneksi (curl #{$errno}): {$error}");
        }

        if ($code < 200 || $code >= 300) {
            Log::error('Epicor EFx call failed (HTTP)', ['fn' => "$library/$function", 'status' => $code, 'body' => $response]);
            // Pesan dari BPM/Function Epicor (mis. validasi) diteruskan ke pengguna
            $msg = json_decode($response, true)['ErrorMessage'] ?? json_decode($response, true)['Message'] ?? $response;
            throw new RuntimeException("Epicor menolak proses: {$msg}");
        }

        return json_decode($response, true) ?? [];
    }
}