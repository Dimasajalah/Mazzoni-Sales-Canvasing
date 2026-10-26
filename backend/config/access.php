<?php

$csv = fn (string $v): array => array_values(array_filter(array_map('trim', explode(',', $v))));

/*
 * Aturan akses data milik sales (order, retur, expense). Semua bisa diubah lewat .env tanpa mengubah kode.
 */
return [
    // Saklar darurat: false = perilaku lama (semua pengguna login bisa melihat dan mengubah semua). Pakai hanya untuk membatalkan sementara bila ada alur lapangan yang terblokir.
    'enforce' => filter_var(env('ACCESS_ENFORCE', true), FILTER_VALIDATE_BOOLEAN),

    // Peran yang boleh melihat order dan retur milik semua sales. Peran lain hanya melihat miliknya sendiri.
    'view_all_roles' => $csv(env('ACCESS_VIEW_ALL_ROLES', 'supervisor,admin')),

    // Peran yang boleh mengubah status retur.
    'return_status_roles' => $csv(env('ACCESS_RETURN_STATUS_ROLES', 'supervisor,admin')),

    // Status retur yang dikenal dan perpindahan yang diizinkan (hanya maju; REJECTED dan RMA_ISSUED menutup proses).
    // Siklus mengikuti FDD Sales Mobile 4.13: Submitted -> Verified -> Approved/RMA (bisa Rejected).
    'return_transitions' => [
        'SUBMITTED' => ['VERIFIED', 'APPROVED', 'REJECTED'],
        'VERIFIED' => ['APPROVED', 'REJECTED'],
        'APPROVED' => ['RMA_ISSUED'],
        'RMA_ISSUED' => [],
        'REJECTED' => [],
    ],

    // Expense: peran yang menyetujui atau menolak, dan peran yang menandai Dibayar. Keduanya otomatis boleh melihat semua expense.
    // Bawaan ini adalah usulan (belum diputuskan tim functional): supervisor dan admin menyetujui, finance dan admin membayar.
    'expense_approve_roles' => $csv(env('ACCESS_EXPENSE_APPROVE_ROLES', 'supervisor,admin')),
    'expense_pay_roles' => $csv(env('ACCESS_EXPENSE_PAY_ROLES', 'finance,admin')),

    // Siklus expense mengikuti FDD Sales Mobile 4.12: Submitted -> Approved -> Paid (bisa Rejected).
    'expense_transitions' => [
        'SUBMITTED' => ['APPROVED', 'REJECTED'],
        'APPROVED' => ['PAID', 'REJECTED'],
        'PAID' => [],
        'REJECTED' => [],
    ],
];