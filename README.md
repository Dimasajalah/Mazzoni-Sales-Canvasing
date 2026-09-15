# Sales Canvassing BMT

Aplikasi sales lapangan Mazzoni berdasarkan prototype `Prototype_Sales_Canvassing_BMT.html`.

**Tahap sekarang:** DATABASE STAGING APLIKASI = source of truth.  
**Epicor:** belum diintegrasikan (lihat `docs/EPICOR_INTEGRATION_PLAN.md`).

## Arsitektur

```
Frontend (React + Vite)
        ↓ REST /api/v1
Laravel Backend + Service Layer + Staging Providers
        ↓
MySQL / MariaDB Staging (atau SQLite lokal)
```

## Struktur

| Path | Isi |
|------|-----|
| `backend/` | Laravel API + Sanctum |
| `frontend/` | React SPA (UI mengikuti prototype) |
| `docs/` | Analisis prototype, DB, arsitektur, rencana Epicor |

## Persyaratan

- PHP 8.2+
- Composer
- Node.js 20+
- MySQL/MariaDB (production/staging) — lokal boleh SQLite

## Setup Backend

```bash
cd backend
cp .env.example .env
# isi DB_* untuk MySQL staging, atau biarkan sqlite untuk lokal
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

API: `http://localhost:8000`

## Setup Frontend

```bash
cd frontend
cp .env.example .env   # jika ada
npm install
npm run dev
```

App: `http://localhost:5173`

## User demo (setelah seed)

| Role | Login | Password |
|------|-------|----------|
| Sales | `budi.santoso` | `password` |
| Admin | `admin` | `password` |
| Supervisor | `supervisor` | `password` |
| Finance | `finance` | `password` |
| Warehouse | `warehouse` | `password` |

## Versi & Backup

Versi saat ini: lihat file `VERSION` (semver).

**Sebelum update**, backup source lama lalu naikkan versi:

```powershell
cd C:\cursor\project\mazzoni\sales_canvassing
.\scripts\bump-version.ps1 -Part patch -Message "Ringkasan perubahan"
```

Hanya backup tanpa naik versi:

```powershell
.\scripts\backup-version.ps1
```

Hasil backup tersimpan di:

`C:\cursor\project\mazzoni\backups\sales_canvassing\v{VERSION}_{tanggal}\`

Folder itu berisi salinan source (tanpa `node_modules`, `vendor`, `.env`).

## Dokumentasi

- [Prototype Analysis](docs/PROTOTYPE_ANALYSIS.md)
- [Database Design](docs/DATABASE_DESIGN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Epicor Integration Plan](docs/EPICOR_INTEGRATION_PLAN.md)
- [Epicor Postman Checklist](docs/EPICOR_POSTMAN_CHECKLIST.md)
- [Changelog](CHANGELOG.md)

## Catatan penting

- Credential DB hanya di backend `.env` — jangan hardcode.
- Tidak ada dependency Epicor pada tahap ini.
- Field `epicor_*` / `sync_status` disiapkan untuk integrasi berikutnya via Provider pattern.
