# Backend — Sales Canvassing BMT

Laravel REST API + Sanctum. Staging database = source of truth. Epicor belum diintegrasikan.

## Setup

```bash
cp .env.example .env
php artisan key:generate
# Isi DB_* MySQL staging, atau pakai sqlite lokal:
# DB_CONNECTION=sqlite

php artisan migrate --seed
php artisan storage:link
php artisan serve
```

API: `http://localhost:8000`

## Demo users

Password semua: `password`

| Username | Role |
|----------|------|
| budi.santoso | sales |
| admin | admin |
| supervisor | supervisor |
| finance | finance |
| warehouse | warehouse |

## Test

```bash
php artisan test
```

## Architecture

Controller → Service → Staging*Provider → Eloquent/Staging DB

Config: `DATA_SOURCE=staging`, `VISIT_RADIUS_METERS=500`
