<?php

return [
    'visit_radius_meters' => (int) env('VISIT_RADIUS_METERS', 500),
    'data_source' => env('DATA_SOURCE', 'staging'),
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:5173'),
];
