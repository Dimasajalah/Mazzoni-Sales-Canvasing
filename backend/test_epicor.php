<?php
// test_epicor.php
// Cara pakai: taruh file ini di folder backend/, lalu jalankan:
//   php test_epicor.php
// Isi kredensial di bawah ini dulu (JANGAN commit file ini ke git kalau sudah diisi).

$baseUrl  = 'https://herbalgujati-pilot.epicorsaas.com/server';
$company  = '169855';
$username = 'manager';
$password = 'PrO#roy5c8It';
$apiKey   = 'F69Npll3v9wIWHCon7harcFe1cCPdZ0cOpGPIx4UYalu3';

$url = "$baseUrl/api/v2/odata/$company/BaqSvc/zES_Customers/Data";

echo "=== Test 1: file_get_contents (stream wrapper, bukan curl) ===\n";
echo "URL: $url\n";

$opts = [
    'http' => [
        'method' => 'GET',
        'header' => "Authorization: Basic " . base64_encode("$username:$password") . "\r\n"
                  . "X-API-Key: $apiKey\r\n"
                  . "Accept: application/json\r\n",
        'timeout' => 30,
        'ignore_errors' => true, // supaya tetap dapat body walau status bukan 200
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
    ],
];

$start = microtime(true);
$ctx = stream_context_create($opts);
$result = @file_get_contents($url, false, $ctx);
$elapsed = round(microtime(true) - $start, 2);

if ($result === false) {
    echo "GAGAL (file_get_contents) setelah {$elapsed}s\n";
    $err = error_get_last();
    echo "Error: " . ($err['message'] ?? 'unknown') . "\n";
} else {
    echo "BERHASIL (file_get_contents) dalam {$elapsed}s\n";
    echo "Response headers: " . print_r($http_response_header ?? [], true) . "\n";
    echo "Body (500 char pertama): " . substr($result, 0, 500) . "\n";
}

echo "\n\n=== Test 2: curl langsung (ini yang dipakai Laravel di balik layar) ===\n";

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
    CURLOPT_USERPWD        => "$username:$password",
    CURLOPT_HTTPHEADER     => [
        "Accept: application/json",
        "X-API-Key: $apiKey",
    ],
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_VERBOSE        => true,
]);

// Tangkap verbose log curl ke variabel supaya kelihatan detail prosesnya
$verbose = fopen('php://temp', 'w+');
curl_setopt($ch, CURLOPT_STDERR, $verbose);

$start = microtime(true);
$response = curl_exec($ch);
$elapsed = round(microtime(true) - $start, 2);

if ($response === false) {
    echo "GAGAL (curl) setelah {$elapsed}s\n";
    echo "curl_errno: " . curl_errno($ch) . "\n";
    echo "curl_error: " . curl_error($ch) . "\n";
} else {
    echo "BERHASIL (curl) dalam {$elapsed}s\n";
    echo "HTTP Code: " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . "\n";
    echo "Body (500 char pertama): " . substr($response, 0, 500) . "\n";
}

rewind($verbose);
echo "\n--- Verbose curl log ---\n";
echo stream_get_contents($verbose);

curl_close($ch);