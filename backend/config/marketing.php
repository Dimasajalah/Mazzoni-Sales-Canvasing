<?php
//backend/config/marketing.php
$csv = fn ($v) => array_values(array_filter(array_map('trim', explode(',', (string) $v))));

return [
    // Blueprint MJU 3.2.2 (MKT02) langkah 02. Daftar resmi Activity Type akan dikirim MJU terpisah (Table 3.1);
    // sampai itu tiba, tiga nilai dari diagram dipakai. "KLAIM" sengaja tidak di sini: dipakai khusus Program Klaim (MKT04).
    'activity_types' => [
        'EVENT' => 'Event',
        'BRANDING' => 'Branding',
        'NON_KLAIM' => 'Non-Klaim',
    ],

    // Blueprint MJU 3.2.4 (MKT04 Program Klaim Entry)
    'claim_activity_type' => 'KLAIM',

    // Langkah 05: Jenis Klaim
    'claim_types' => [
        'DISKON_PRODUK' => 'Diskon Produk',
        'SUBSIDI_DISKON_PARETO' => 'Subsidi Diskon Pareto',
        'REWARD' => 'Reward',
        'TARGET_GROWTH_OA' => 'Target atas Insentif Growth OA',
    ],

    // Langkah 06: Sumber Data Klaim (Sell Out berarti perlu upload data sell out di MKT07)
    'claim_sources' => [
        'SELL_IN' => 'Sell In',
        'SELL_OUT' => 'Sell Out',
    ],

    // Langkah 07: basis perhitungan nilai klaim. Dokumen hanya menyebut "basis perhitungan, ambang, dan besaran";
    // dua basis ini asumsi sementara, tinggal diganti di sini setelah dikonfirmasi tim functional.
    'claim_bases' => [
        'SALES_VALUE' => 'Nilai Penjualan',
        'QUANTITY' => 'Kuantitas',
    ],

    // Pemberi persetujuan per tahap. Aplikasi belum punya role seperti "Manager Marketing" atau "Direktur Sales", jadi diatur
    // di sini atau di .env: satu pengguna boleh bertindak di tahap itu bila role-nya ada di daftar ATAU email-nya ada di daftar email.
    'approval' => [
        // Blueprint MJU 3.2.5 (MKT05 Approval Pembuatan Program Klaim): dua tahap berurutan.
        'claim' => [
            1 => [
                'label' => 'Manager Marketing',
                'roles' => $csv(env('MARKETING_CLAIM_L1_ROLES', 'supervisor')),
                'emails' => $csv(env('MARKETING_CLAIM_L1_EMAILS', '')),
            ],
            2 => [
                'label' => 'Direktur Sales',
                'roles' => $csv(env('MARKETING_CLAIM_L2_ROLES', 'admin')),
                'emails' => $csv(env('MARKETING_CLAIM_L2_EMAILS', '')),
            ],
        ],

        // Blueprint MJU 3.2.6 (MKT06 Approval Event): enam tahap berurutan. Tahap 6 (Direktur Utama) hanya berlaku bila
        // nominal RAB di atas 30 juta ("when_amount_above"); bila tidak, event selesai setelah tahap 5.
        // Bawaan role: tahap 1-3 supervisor, tahap 4-6 admin (aplikasi hanya punya dua role pengelola ini);
        // ganti lewat .env bila ada role atau email lain.
        'event' => [
            1 => [
                'label' => 'Koordinator Marketing',
                'roles' => $csv(env('MARKETING_EVENT_L1_ROLES', 'supervisor')),
                'emails' => $csv(env('MARKETING_EVENT_L1_EMAILS', '')),
            ],
            2 => [
                'label' => 'SPV Per Region',
                'roles' => $csv(env('MARKETING_EVENT_L2_ROLES', 'supervisor')),
                'emails' => $csv(env('MARKETING_EVENT_L2_EMAILS', '')),
            ],
            3 => [
                'label' => 'Manager Marketing',
                'roles' => $csv(env('MARKETING_EVENT_L3_ROLES', 'supervisor')),
                'emails' => $csv(env('MARKETING_EVENT_L3_EMAILS', '')),
            ],
            4 => [
                'label' => 'Manager Accounting',
                'roles' => $csv(env('MARKETING_EVENT_L4_ROLES', 'admin')),
                'emails' => $csv(env('MARKETING_EVENT_L4_EMAILS', '')),
            ],
            5 => [
                'label' => 'Direktur Sales',
                'roles' => $csv(env('MARKETING_EVENT_L5_ROLES', 'admin')),
                'emails' => $csv(env('MARKETING_EVENT_L5_EMAILS', '')),
            ],
            6 => [
                'label' => 'Direktur Utama',
                'roles' => $csv(env('MARKETING_EVENT_L6_ROLES', 'admin')),
                'emails' => $csv(env('MARKETING_EVENT_L6_EMAILS', '')),
                'when_amount_above' => (float) env('MARKETING_EVENT_L6_MIN_AMOUNT', 30000000),
            ],
        ],

        // Blueprint MJU 3.2.9 (MKT09 Approval Pengajuan Program Klaim): empat tahap berurutan setelah nilai selisih dikonfirmasi
        // ke distributor (konfirmasi dilakukan oleh pemberi persetujuan tahap 1). Penyesuaian nilai hanya di tahap terakhir.
        'claim_submission' => [
            1 => [
                'label' => 'Koordinator Marketing',
                'roles' => $csv(env('MARKETING_CLAIMSUB_L1_ROLES', 'supervisor')),
                'emails' => $csv(env('MARKETING_CLAIMSUB_L1_EMAILS', '')),
            ],
            2 => [
                'label' => 'Manager Marketing',
                'roles' => $csv(env('MARKETING_CLAIMSUB_L2_ROLES', 'supervisor')),
                'emails' => $csv(env('MARKETING_CLAIMSUB_L2_EMAILS', '')),
            ],
            3 => [
                'label' => 'Manager Accounting',
                'roles' => $csv(env('MARKETING_CLAIMSUB_L3_ROLES', 'admin')),
                'emails' => $csv(env('MARKETING_CLAIMSUB_L3_EMAILS', '')),
            ],
            4 => [
                'label' => 'Direktur Sales',
                'roles' => $csv(env('MARKETING_CLAIMSUB_L4_ROLES', 'admin')),
                'emails' => $csv(env('MARKETING_CLAIMSUB_L4_EMAILS', '')),
            ],
        ],
    ],

    // "Seluruh otorisasi berhak approve maupun reject dengan mengisi reason code." Daftar resmi reason code belum ada di
    // dokumen; isi di bawah ini asumsi sementara dan bisa diganti sesuai daftar MJU.
    'approval_reason_codes' => [
        'APPROVE' => [
            'SESUAI_ANGGARAN' => 'Sesuai anggaran',
            'SESUAI_STRATEGI' => 'Sesuai strategi penjualan',
        ],
        'REJECT' => [
            'ANGGARAN_TIDAK_SESUAI' => 'Anggaran tidak sesuai',
            'PARAMETER_TIDAK_SESUAI' => 'Parameter program tidak sesuai',
            'TARGET_TIDAK_SESUAI' => 'Target tidak sesuai',
            'DOKUMEN_KURANG' => 'Dokumen pendukung kurang',
            'LAINNYA' => 'Lainnya',
        ],
    ],

    // Blueprint MJU 3.2.7 (MKT07 Upload Data Sell Out). Master Epicor yang dipakai sebagai acuan validasi baris adalah salinan
    // lokal di aplikasi; kolom yang dicocokkan bisa diganti di sini. Kolom yang tidak ada di tabelnya dilewati.
    'sellout' => [
        'max_rows' => (int) env('MARKETING_SELLOUT_MAX_ROWS', 5000),
        'outlet_columns' => ['customer_code'],                 // tabel customers
        'salesman_columns' => ['salesperson_code'],            // tabel users
        'part_columns' => ['part_num', 'epicor_part_num'],     // tabel products
    ],

    // Blueprint MJU 3.2.8 (MKT08 Pengajuan Program Klaim)
    'claim_submission' => [
        // Klaim yang melewati periode klaim berstatus Pending dan hanya lanjut bila di-pass oleh Direktur Sales.
        'late_pass' => [
            'label' => 'Direktur Sales',
            'roles' => $csv(env('MARKETING_CLAIM_LATE_PASS_ROLES', 'admin')),
            'emails' => $csv(env('MARKETING_CLAIM_LATE_PASS_EMAILS', '')),
        ],
        'payout_methods' => [
            'POTONG_NOTA' => 'Potong Nota',
            'POTONG_TAGIHAN' => 'Potong Tagihan',
            'TRANSFER' => 'Transfer',
            'BARANG' => 'Barang',
        ],
    ],

    // Sumber data Sell In dibaca dari AR Invoice distributor dalam periode program. Nama tabel dan kolom di bawah adalah tebakan:
    // kolom pertama yang ada di tabel dipakai; bila tidak ada satu pun, perhitungan berhenti dengan pesan galat (tidak menebak angka).
    'sellin' => [
        'table' => 'invoices',
        'customer_columns' => ['customer_id'],
        'date_columns' => ['invoice_date', 'date', 'issued_at'],
        'amount_columns' => ['total_amount', 'total', 'amount', 'grand_total'],
        'lines_table' => 'invoice_lines',
        'lines_invoice_columns' => ['invoice_id'],
        'lines_qty_columns' => ['qty', 'quantity'],
    ],

    // Blueprint MJU 3.2.10 (MKT10 Metode Pencairan Program, Potong Nota): Sales memotong klaim yang sudah disetujui pada nota (invoice)
    // distributor. Sales hanya melihat klaim milik distributor yang menjadi tanggung jawabnya; admin dan supervisor melihat semuanya.
    'claim_deduction' => [
        'roles' => $csv(env('MARKETING_DEDUCTION_ROLES', 'sales,supervisor,admin')),
        'misc_charge_code' => 'KLAIM', // potongan ditambahkan sebagai Misc Charge berkode KLAIM bernilai negatif
    ],

    // Blueprint MJU 3.2.11 (MKT11 Metode Pencairan Program, Potong Tagihan): Finance membuat credit memo atas invoice lama yang masih terbuka,
    // senilai klaim yang disetujui, lalu Check & Post dan Apply. Jenis pajak dipilih sesuai status distributor bila dikenakan PPh.
    'credit_memo' => [
        'roles' => $csv(env('MARKETING_CREDIT_MEMO_ROLES', 'finance,admin')),
        'tax_types' => [
            'PPH_BADAN' => 'PPh Badan',
            'PPH_PRIBADI' => 'PPh Pribadi',
        ],
    ],

    // Blueprint MJU 3.2.12 (MKT12 Metode Pencairan Program, Transfer): Finance mengisi rekening tujuan dan status PKP distributor, memilih Tax Type
    // (PPh 21 untuk rekening perorangan, PPh 23 untuk lainnya), lalu setelah dana ditransfer mengisi nomor referensi dan klaim menjadi Dicairkan.
    'transfer' => [
        'roles' => $csv(env('MARKETING_TRANSFER_ROLES', 'finance,admin')),
        'pph21_rate' => (float) env('MARKETING_PPH21_RATE', 2.5),            // rekening perorangan (dasar NPWP atau KTP penerima)
        'pph23_pkp_rate' => (float) env('MARKETING_PPH23_PKP_RATE', 2),      // bukan perorangan, distributor PKP
        'pph23_non_pkp_rate' => (float) env('MARKETING_PPH23_NONPKP_RATE', 4), // bukan perorangan, distributor Non-PKP
        'tax_types' => ['PPH_21' => 'PPh 21', 'PPH_23' => 'PPh 23'],
        'tax_id_types' => ['NPWP' => 'NPWP', 'KTP' => 'KTP'],
    ],

    // Blueprint MJU 3.2.13 (MKT13 Metode Pencairan Program, Barang/Reward): Marketing mengatur jenis dan jumlah barang, memeriksa stok warehouse
    // Marketing, mengajukan Requisition bila stok tidak ada, lalu Misc. Shipment, Issue Misc. Material, dan serah terima kepada penerima.
    'claim_goods' => [
        'roles' => $csv(env('MARKETING_GOODS_ROLES', 'supervisor,admin')),
        'max_items' => 20,
    ],

    // Blueprint MJU 3.2.14 (PR01 Requisition User, Reward dan Design; Purchasing Management). Siapa mengerjakan tiap peran di diagram diatur lewat
    // role (atau email) di .env. Bawaan: User, PIC Dept, dan Manager Dept = supervisor; Direktur, Purchasing, dan IT = admin.
    'purchase_requisition' => [
        'categories' => ['REWARD' => 'Reward', 'DESIGN' => 'Design'],
        'asset_threshold' => (float) env('PR_ASSET_THRESHOLD', 30000000), // lebih dari ini: Direktur ikut menyetujui (selain barang asset)
        'max_lines' => 50,
        'dispatch_targets' => [
            'PO_BOP_SUPPLIER' => 'PO BOP Supplier',
            'PO_BOP_LAPANGAN' => 'PO BOP Lapangan',
            'PO_RMPM_LAPANGAN' => 'PO RMPM Lapangan',
        ],
        'roles' => [
            'user' => $csv(env('PR_USER_ROLES', 'supervisor,admin')),
            'pic' => $csv(env('PR_PIC_ROLES', 'supervisor')),
            'manager' => $csv(env('PR_MANAGER_ROLES', 'supervisor')),
            'director' => $csv(env('PR_DIRECTOR_ROLES', 'admin')),
            'purchasing' => $csv(env('PR_PURCHASING_ROLES', 'admin')),
            'it' => $csv(env('PR_IT_ROLES', 'admin')),
        ],
        'emails' => [
            'user' => $csv(env('PR_USER_EMAILS', '')),
            'pic' => $csv(env('PR_PIC_EMAILS', '')),
            'manager' => $csv(env('PR_MANAGER_EMAILS', '')),
            'director' => $csv(env('PR_DIRECTOR_EMAILS', '')),
            'purchasing' => $csv(env('PR_PURCHASING_EMAILS', '')),
            'it' => $csv(env('PR_IT_EMAILS', '')),
        ],
    ],

    // Blueprint MJU 3.2.15 (MKT14 Move Inventory Request Display Support Event): Marketing memeriksa on-hand di Inventory Marketing, membuat Move
    // Inventory Request dari WH FG ke WH Marketing, Warehouse menjalankan Inventory Transfer (Pra-SJ), lalu Marketing melakukan Issue Misc. Material
    // dan mencatat penerima serta nama event pada Remarks. Marketing = supervisor dan admin; Warehouse = warehouse dan admin (bisa diubah di .env).
    'move_request' => [
        'roles' => [
            'marketing' => $csv(env('MARKETING_MOVE_MARKETING_ROLES', 'supervisor,admin')),
            'warehouse' => $csv(env('MARKETING_MOVE_WAREHOUSE_ROLES', 'warehouse,admin')),
        ],
        'max_items' => 20,
    ],

    // Blueprint MJU 3.2.17 (MKT17 Issue Miscellaneous Material): permintaan User disampaikan di luar sistem (tidak dicatat); Marketing mengeluarkan
    // barang dengan Issue Misc. Material lalu mengisi nama sales atau customer beserta peruntukannya pada Remarks. Pelaku: Marketing (supervisor, admin).
    'issue_material' => [
        'roles' => $csv(env('MARKETING_ISSUE_ROLES', 'supervisor,admin')),
        'max_items' => 20,
        'recipient_types' => ['SALES' => 'Sales', 'CUSTOMER' => 'Customer'],
    ],

    // Blueprint MJU 5.2.14 (SL14 Achievement Sales). Dashboard saja; Data Sales Target dan Achievement dihitung manual
    // di luar sistem oleh Marketing/Admin lalu diupload lewat template CSV ini. Aplikasi tidak menghitung capaian.
    'achievement' => [
        'max_rows' => (int) env('SALES_ACHIEVEMENT_MAX_ROWS', 5000),
        'roles' => $csv(env('SALES_ACHIEVEMENT_ROLES', 'supervisor,admin')),
    ],
];