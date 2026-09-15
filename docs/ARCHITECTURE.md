# Architecture — Sales Canvassing BMT

## Sekarang (Staging)

```
Sales Mobile / Web (React + Vite)
        ↓ HTTPS
Frontend SPA
        ↓ REST /api/v1
Laravel Controllers
        ↓
Service Layer (CustomerService, VisitService, …)
        ↓
Provider / Adapter (Staging*Provider)
        ↓
DATABASE STAGING APLIKASI (MySQL)
```

## Masa depan (Epicor)

```
Frontend (TIDAK berubah besar)
        ↓
Laravel Controllers + Services (business rules tetap)
        ↓
Provider Interface
        ├─ Staging*Provider (fallback / hybrid)
        └─ Epicor*Provider (baru)
                ↓
        Integration Layer → Epicor REST / Kinetic
```

## Provider Pattern (minimal)

| Interface | Staging Impl | Future |
|-----------|--------------|--------|
| CustomerDataProviderInterface | StagingCustomerProvider | EpicorCustomerProvider |
| InventoryDataProviderInterface | StagingInventoryProvider | Epicor… |
| SalesOrderProviderInterface | StagingSalesOrderProvider | Epicor… |
| ARDataProviderInterface | StagingARProvider | Epicor… |
| PaymentProviderInterface | StagingPaymentProvider | Epicor… |

Binding di `AppServiceProvider` via config `DATA_SOURCE=staging`.

## Layer Rules

1. Frontend hanya memanggil `/api/v1/*`.
2. Controller: auth, validation, response format — tidak query kompleks.
3. Service: business logic (Haversine, aging, payment transaction, numbering).
4. Provider: akses data staging (Eloquent) — nanti diganti Epicor.
5. Tidak ada credential DB di frontend.

## Auth

Laravel Sanctum (token SPA/mobile). Roles: admin, sales, supervisor, finance, warehouse.

## API Response

```json
{ "success": true, "message": "Success", "data": {} }
{ "success": false, "message": "Validation failed", "errors": {} }
```

## Offline

Frontend: online/offline indicator + local draft (lead, expense, return, draft order, visit note) + idempotency UUID saat sync.

## Config (.env)

```
DB_* (staging)
VISIT_RADIUS_METERS=500
DATA_SOURCE=staging
FILESYSTEM_DISK=local
```

Tidak ada `EPICOR_*` di tahap ini.
