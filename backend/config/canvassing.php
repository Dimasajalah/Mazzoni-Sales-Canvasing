<?php
//backend/config/canvassing.php
return [
    /*
    |--------------------------------------------------------------------------
    | Application Data Source
    |--------------------------------------------------------------------------
    |
    | staging = local/app database providers
    | epicor  = future Epicor adapters (not implemented yet)
    |
    */
    'data_source' => env('DATA_SOURCE', 'staging'),

    'visit_radius_meters' => (int) env('VISIT_RADIUS_METERS', 500),

    /*
    | Pembulatan konversi Kg -> pcs (pcs = Kg x 1000 / gramasi gr).
    | ceil = dibulatkan ke atas (default, aman: tidak kurang kirim), floor = ke bawah, round = terdekat.
    | Aturan pasti menunggu konfirmasi tim functional.
    */
    'pcs_rounding' => env('PCS_ROUNDING', 'ceil'),

    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),
];
