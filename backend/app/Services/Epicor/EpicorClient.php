<?php
// backend/app/Services/Epicor/EpicorClient.php

namespace App\Services\Epicor;

use Illuminate\Support\Facades\Log;
use RuntimeException;

class EpicorClient
{
    private string $baseUrl;
    private string $company;
    private string $username;
    private string $password;
    private string $apiKey;
    private bool $verifySsl;

    public function __construct()
    {
        $this->baseUrl   = rtrim((string) config('services.epicor.base_url'), '/');
        $this->company   = (string) config('services.epicor.company');
        $this->username  = (string) config('services.epicor.username');
        $this->password  = (string) config('services.epicor.password');
        $this->apiKey    = (string) config('services.epicor.api_key');
        $this->verifySsl = (bool) config('services.epicor.verify_ssl', true);
    }

    /**
     * Ambil seluruh data dari sebuah BAQ, menggunakan curl PHP native
     * (bukan Laravel Http::/Guzzle) — terbukti stabil di jaringan yang
     * membuat Guzzle mengalami SSL handshake timeout.
     *
     * @param  string       $baqId   Nama BAQ, misal "zES_Customers"
     * @param  string|null  $filter  Filter OData opsional, misal "Customer_CreditHold eq false"
     * @return array<int, array<string, mixed>>
     */
    public function getBaq(string $baqId, ?string $filter = null): array
    {
        if ($this->baseUrl === '' || $this->company === '') {
            throw new RuntimeException(
                'Konfigurasi Epicor belum lengkap. Cek EPICOR_BASE_URL dan EPICOR_COMPANY di .env'
            );
        }

        $url = "{$this->baseUrl}/api/v2/odata/{$this->company}/BaqSvc/{$baqId}/Data";

        if ($filter) {
            $url .= '?' . http_build_query(['$filter' => $filter]);
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
            CURLOPT_USERPWD        => "{$this->username}:{$this->password}",
            CURLOPT_HTTPHEADER     => [
                'Accept: application/json',
                "X-API-Key: {$this->apiKey}",
            ],
            CURLOPT_SSL_VERIFYPEER => $this->verifySsl,
            CURLOPT_SSL_VERIFYHOST => $this->verifySsl ? 2 : 0,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT        => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErrno = curl_errno($ch);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $curlErrno !== 0) {
            Log::error('Epicor BAQ call failed (curl error)', [
                'baq' => $baqId,
                'url' => $url,
                'curl_errno' => $curlErrno,
                'curl_error' => $curlError,
            ]);

            throw new RuntimeException(
                "Epicor BAQ '{$baqId}' gagal koneksi (curl #{$curlErrno}): {$curlError}"
            );
        }

        if ($httpCode < 200 || $httpCode >= 300) {
            Log::error('Epicor BAQ call failed (HTTP error)', [
                'baq' => $baqId,
                'url' => $url,
                'status' => $httpCode,
                'body' => $response,
            ]);

            throw new RuntimeException(
                "Epicor BAQ '{$baqId}' gagal dengan status {$httpCode}: {$response}"
            );
        }

        $decoded = json_decode($response, true);

        return $decoded['value'] ?? [];
    }
}