# Checklist Postman — Uji API Epicor (sebelum integrasi app)

**Tujuan:** memastikan koneksi & master data Epicor bisa dibaca, **tanpa** mengubah aplikasi Sales Canvassing.  
App saat ini masih `DATA_SOURCE=staging` — checklist ini murni uji ke server Epicor.

## Yang diminta ke IT Epicor

Isi tabel ini dulu (wajib sebelum Postman jalan):

| Variabel | Contoh / catatan | Nilai dari IT |
|----------|------------------|---------------|
| `baseUrl` | `https://epicor.perusahaan.com/ERP10` atau Kinetic host | |
| `company` | Company ID Epicor, mis. `Mazzoni` / `EPIC06` | |
| `username` | User API / service account | |
| `password` | Password user API | |
| `apiKey` | Jika server pakai API Key (opsional) | |
| `plant` | Plant default, mis. `MfgSys` (opsional utk PartWhse) | |
| Auth mode | Basic **atau** Bearer token | |

Path OData umum Kinetic / ERP REST v2:

```
{{baseUrl}}/api/v2/odata/{{company}}/...
```

Jika IT memakai URL berbeda (BAQ-only, AppServer klasik), sesuaikan path — jangan memaksa path di bawah ini.

---

## Import ke Postman

1. Buka Postman → **Import**
2. Import file:
   - `docs/postman/Epicor_Kinetic_Smoke_Test.postman_collection.json`
   - `docs/postman/Epicor_Kinetic.environment.json`
3. Pilih environment **Epicor Kinetic (placeholder)**
4. Isi variabel environment (jangan commit password ke git)
5. Jalankan folder **01 — Connectivity** dulu

---

## Urutan smoke test (centang)

### 01 — Connectivity
- [ ] **GET Ping / Companies** (atau endpoint health yang IT berikan) → status **200**
- [ ] Response JSON terbaca (bukan HTML login page)
- [ ] Jika **401/403** → auth salah / user belum punya REST rights
- [ ] Jika **404** → `baseUrl` / versi API salah — konfirmasi ke IT

### 02 — Master Customer ↔ staging `customers`
- [ ] **GET Customers** (top 10) → ada `CustNum` / `CustID` / `Name`
- [ ] Catat 1 sample: `CustID` → nanti map ke `epicor_customer_num`
- [ ] Filter 1 customer by `CustID` sukses

### 03 — Master Part ↔ staging `products`
- [ ] **GET Parts** (top 10) → ada `PartNum` / `PartDescription`
- [ ] Bandingkan apakah ada part mirip prototype (`STM-1000`, dll.) — **boleh beda**; yang penting field tersedia
- [ ] Catat 1 sample: `PartNum` → map ke `epicor_part_num`

### 04 — Inventory / On Hand ↔ staging `inventories`
- [ ] **GET PartWarehouses** atau BAQ on-hand yang IT sediakan
- [ ] Ada qty + warehouse/bin (nama field bisa beda per versi)
- [ ] Catat field qty yang akan dipakai sync

### 05 — Sales Order (read-only dulu)
- [ ] **GET SalesOrders** / OrderHed top N → ada `OrderNum`
- [ ] **Jangan POST/PATCH** di tahap smoke test kecuali IT mengizinkan sandbox

### 06 — AR Invoice (read-only)
- [ ] **GET AR Invoices** / InvcHead → ada `InvoiceNum`, balance/open amount jika ada

### 07 — Shipment / Pack (opsional)
- [ ] **GET Shipments** / Pack → `PackNum` untuk map `epicor_pack_num`

### 08 — RMA (opsional)
- [ ] **GET RMA** → `RMANum` untuk map `epicor_rma_num`

---

## Kriteria “lulus” untuk mulai integrasi app

Minimal harus hijau:

1. Auth + Company valid  
2. Customer list readable  
3. Part list readable  
4. On-hand readable (BO atau BAQ)  

Baru setelah itu masuk kerjaan coding `Epicor*Provider` di Laravel.

---

## Mapping cepat hasil uji → app

| Hasil Epicor | Kolom staging app |
|--------------|-------------------|
| CustNum / CustID | `customers.epicor_customer_num` |
| PartNum | `products.epicor_part_num` / `part_num` |
| OrderNum | `sales_orders.epicor_order_num` |
| InvoiceNum | `invoices.epicor_invoice_num` |
| PackNum | `shipments.epicor_pack_num` |
| RMANum | `return_requests.epicor_rma_num` |

Detail rencana: [EPICOR_INTEGRATION_PLAN.md](./EPICOR_INTEGRATION_PLAN.md)

---

## Contoh header (Basic Auth)

Postman tab **Authorization** → Type **Basic Auth** → Username / Password.

Atau header manual:

```http
Authorization: Basic {{base64(username:password)}}
Accept: application/json
```

Jika pakai API Key (tergantung setup):

```http
X-API-Key: {{apiKey}}
```

---

## Troubleshooting singkat

| Gejala | Kemungkinan |
|--------|-------------|
| SSL error | Sertifikat internal — di Postman coba Settings → SSL certificate verification OFF (hanya lab) |
| 401 | User/password, atau user tidak punya akses REST |
| 400 / OData error `$top` | Versi API beda — turunkan `$top` atau hapus `$select` |
| Timeout | VPN / firewall — minta IT whitelist IP Anda |
| HTML / form login | URL mengarah ke UI, bukan API — perbaiki `baseUrl` |

---

## Keamanan

- Jangan commit environment berisi password.
- Pakai user **read-only** untuk smoke test jika IT bisa sediakan.
- Uji tulis (POST Order) hanya di company **TEST / Pilot**, bukan production.
