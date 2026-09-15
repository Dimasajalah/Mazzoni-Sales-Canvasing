<?php

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

    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),
];
