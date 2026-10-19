<?php

return [
    // 'staging' = data contoh bawaan; 'epicor' = BAQ di Epicor (MZN_CashAdvanceIssued).
    'source' => env('CASH_ADVANCE_SOURCE', env('DATA_SOURCE', 'staging')),

    // Dokumen dengan ApplyDate sebelum tanggal ini tidak diberitahukan.
    // Kosong = kemarin, supaya dokumen lama tidak membanjiri notifikasi saat pertama kali jalan.
    'notify_since' => env('CASH_ADVANCE_NOTIFY_SINCE'),
    'default_lookback_days' => 1,

    // Kolom tabel users yang dicocokkan dengan Mobile App User ID (urut prioritas; kolom yang tidak ada dilewati).
    'user_match_columns' => array_values(array_filter(array_map('trim', explode(',', (string) env('CASH_ADVANCE_USER_COLUMNS', 'username,email,name'))))),

    // Hanya untuk uji dengan data staging: ganti penerima pada data contoh dengan login Anda sendiri.
    'staging_recipient' => env('CASH_ADVANCE_STAGING_RECIPIENT'),

    'epicor' => [
        'base_url' => env('EPICOR_BASE_URL'), // sampai nama instance, tanpa /api/v2
        'company' => env('EPICOR_COMPANY', '169855'),
        'api_key' => env('EPICOR_API_KEY'),
        'username' => env('EPICOR_USERNAME'),
        'password' => env('EPICOR_PASSWORD'),
        'verify_ssl' => env('EPICOR_VERIFY_SSL', true),
        'baq' => env('CASH_ADVANCE_BAQ', 'MZN_CashAdvanceIssued'),
        'timeout' => 30,
        'top' => 1000,
    ],

    // Nama kolom BAQ yang dicoba (berurutan, tanpa membedakan huruf besar-kecil). Nama REST BAQ biasanya Tabel_Field.
    'columns' => [
        'doc_key' => ['PCashDoc_SysRowID', 'SysRowID', 'DocKey'],
        'cash_desk_id' => ['PCashDoc_CashDeskID', 'CashDeskID'],
        'cash_desk_to' => ['PCashDoc_CashDeskIDTransfer', 'CashDeskIDTransfer', 'CashDeskTo'],
        'cash_desk_to_name' => ['DeskTo_Name', 'PCashDesk_Name', 'Name'],
        'reference_num' => ['PCashDoc_ReferenceNum', 'ReferenceNum'],
        'legal_number' => ['PCashDoc_LegalNumber', 'LegalNumber'],
        'apply_date' => ['PCashDoc_ApplyDate', 'ApplyDate'],
        'amount' => ['PCashDoc_CashAmt', 'PCashDoc_DocCashAmt', 'CashAmt', 'DocCashAmt', 'Amount'],
        'currency' => ['PCashDoc_CurrencyCode', 'CurrencyCode', 'Currency'],
        'recipient' => ['DeskTo_MobileAppUserID_c', 'PCashDesk_MobileAppUserID_c', 'MobileAppUserID_c', 'RecipientRef'],
    ],
];