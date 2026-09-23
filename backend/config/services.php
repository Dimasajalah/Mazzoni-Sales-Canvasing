<?php
//backend/config/services.php
return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],
    'epicor' => [
        'base_url'   => env('EPICOR_BASE_URL'),      // e.g. https://appsvr/ga_dev
        'company'    => env('EPICOR_COMPANY', 'MJU01'),
        'username'   => env('EPICOR_USERNAME'),
        'password'   => env('EPICOR_PASSWORD'),
        'api_key'    => env('EPICOR_API_KEY'),
        'verify_ssl' => env('EPICOR_VERIFY_SSL', true),
    ],
];
