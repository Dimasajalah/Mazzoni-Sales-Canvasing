# Prototype Analysis — Sales Canvassing BMT

Sumber: `c:\canvas\Prototype_Sales_Canvassing_BMT.html`  
Status: Visual + Functional Source of Truth

## 1. Design Tokens

| Token | Nilai |
|-------|-------|
| Orange accent | `#EE6A0A` / `#FF9A4D` |
| Navy text | `#0A1C40` |
| Muted | `#6E7E9E` |
| Card / stroke | `#FFFFFF` / `#E4EAF3` |
| Blue / Green / Amber / Pink | `#2A6FD6` / `#12A05A` / `#B87400` / `#DC3055` |
| Frame | 390×844 (mobile-first) |

Komponen UI wajib: rounded card, chips, badge, bottom nav, FAB, promo carousel, bottom sheet, toast, progress bar, aging buckets, wallet AR summary.

## 2. Screens

| Screen ID | Judul | Navigasi |
|-----------|-------|----------|
| `login` | Login | Entry |
| `home` | Dashboard super-app | Bottom: Home |
| `leads` | Leads list | Bottom: Leads |
| `newlead` | Register New Lead | Dari home / FAB |
| `canvas` | Canvassing pipeline | Dari leads |
| `promo` | Promo Berlaku | Bottom: Promo |
| `order` | Orders list | Bottom: Order |
| `neworder` | Catat Order | Dari order/customer/visit |
| `track` | Order Tracker | Bottom: Track |
| `cust` | Customers | Bottom: Cust |
| `custdetail` | Customer detail | Dari cust |
| `stock` | Cek On Hand | Menu grid |
| `visit` | Sales Visit | Menu grid |
| `checkin` | Check-in Kunjungan | Dari visit/cust |
| `visitmode` | Visit Mode aktif | Setelah check-in OK |
| `arreport` | Laporan Aging AR | Menu / wallet |
| `payment` | Catat Pembayaran | Menu / AR |
| `expense` | Expense Saya | Menu |
| `newexpense` | Laporkan Expense | Dari expense/visit |
| `returns` | Permintaan Retur | Menu |
| `newreturn` | Ajukan Retur | Dari returns/visit |

## 3. Bottom Navigation

1. Home  
2. Leads  
3. Promo  
4. Order  
5. Track  
6. Cust  

FAB: tampil di Leads → New Lead; di Order → New Order.

## 4. Menu Grid (Home)

1. New Lead  
2. Canvassing  
3. New Order  
4. Order Tracker  
5. Customers  
6. Cek On Hand  
7. Promo  
8. Sales Visit  
9. Aging AR  
10. Pembayaran  
11. Expense  
12. Retur  

## 5. Forms & Fields

### Login
- Email / ID Sales
- Kata sandi
- Tombol Masuk

### Register Lead
- Nama Usaha, Nama Pemilik, Alamat
- No. HP/Telp, Email
- Jenis Usaha (Distributor Retail / Grosir / Manufaktur)
- NPWP
- GPS lat/lng (auto)
- Salesperson (auto), Register Date (auto)

### New Order
- Customer, PO Customer (opsional)
- Produk + Qty → line items
- Promo diterapkan
- Total, Buat Order

### Check-in
- Customer select
- GPS distance (Haversine), radius 500 m
- Backend menentukan valid/invalid
- Tombol Check-in (disabled jika jauh)

### Visit Mode / Checkout
- Hasil: Pesanan didapat | Penawaran diberikan | Follow-up dijadwalkan | Tidak bertemu | Toko tutup
- Catatan
- Quick actions: Order, Payment, Return, Expense

### Payment
- Customer, Invoice, Amount, Method (Transfer Bank / Tunai / Giro/Cek / QRIS), Reference, Date

### Expense
- Kategori: Bensin, Tol, Makan, Hotel, Entertain
- Nominal, Customer (opsional), Keterangan, Tanggal
- Foto: Kamera / Galeri (multi)

### Return
- Customer, Part, Nama Part, Qty, SO/DO Ref
- Alasan, Kondisi, Foto

## 6. Workflows

```
Login → Home Dashboard
New Lead → Lead List (stage NEW)
Canvassing → Follow-up sheet → Order (opsional)
Check-in → (distance ≤ 500m) → Visit Mode → Checkout → Visit History
Customer Detail → Check-in / Payment / Order / Promo
Order → Tracker (Order → Shipment → Invoice → Payment)
Payment → update invoice balance
Expense → SUBMITTED → APPROVED/REJECTED → PAID
Return → SUBMITTED → VERIFIED → APPROVED (RMA) / REJECTED
```

## 7. Filters & Search

- Leads: All / New / Contacted / Qualified (+ Quote/Won/Lost di app)
- Promo: Semua / Diskon / Bundle / Cashback
- Expense: Semua / Menunggu / Disetujui / Belum dibayar
- AR: Semua / 1-30 / 31-60 / 60+
- Stock search: part / nama
- Global search: customer, lead, product, SO, invoice (debounce)

## 8. Dashboard Widgets

- Salesperson + territory + online indicator
- Notification badge
- Global search
- Promo carousel (3 banner)
- AR wallet summary + Bayar / Aging
- Menu grid 12 item
- Untuk Anda Hari Ini (kunjungan, upsale, expense, retur, promo)
- Pipeline canvassing bars
- Top 10 Aging AR

## 9. GPS Rules

- `VISIT_RADIUS_METERS=500`
- Haversine di backend
- Simpan: checkin/checkout coords, accuracy, distance, duration, result, notes

## 10. Prototype Sample Data (seed reference)

- Sales: Budi Santoso · Wilayah Surabaya
- 12 customers (Surabaya coords + AR invoices)
- 12 products / stock rows
- 4 leads, 4 promos, 2 orders, visits, expenses, returns
- Payment sample INV-2210

## 11. Interaction Patterns

- Toast success/warn
- Bottom sheet (follow-up, expense detail, return detail)
- Chip filters toggle `.on`
- Carousel scroll dots
- Offline indicator (Online badge di home — app harus detect online/offline)
