# Database Design — Staging Sales Canvassing

Source of truth untuk tahap ini: **DATABASE STAGING APLIKASI** (bukan Epicor).

## ER Overview

```
users ──┬── salespersons ── territories
        ├── leads / lead_activities / lead_followups
        ├── visits / visit_activities
        ├── customers ── invoices ── payments
        │              └── sales_orders ── sales_order_lines
        │                              └── shipments / shipment_lines
        ├── products ── inventories
        ├── promotions ── promo_offer_histories
        ├── expenses ── expense_attachments / expense_status_histories
        ├── return_requests ── return_request_lines / return_attachments
        ├── notifications
        ├── audit_logs
        └── integration_logs
```

## Tables (ringkas)

### users
id, employee_id, salesperson_code, name, email, username, password (hashed), role (admin|sales|supervisor|finance|warehouse), territory, active, last_login_at, timestamps

### territories
id, code, name, timestamps

### customers
id, customer_code (unique), name, customer_group, grade, address, city, phone, email, npwp, credit_limit, latitude, longitude, salesperson_id, active, epicor_customer_num (nullable), external_system, external_id, sync_status, last_sync_at, timestamps

### products
id, part_num (unique), description, uom, price, active, epicor_part_num (nullable), sync fields, timestamps

### inventories
id, product_id, warehouse, bin, on_hand_qty, allocated_qty, available_qty, updated_at

### leads
id, business_name, owner_name, address, phone, email, business_type, npwp, latitude, longitude, salesperson_id, stage (NEW|CONTACTED|QUALIFIED|QUOTE|WON|LOST), estimated_value, register_date, client_uuid (idempotency), timestamps

### visits
id, customer_id, salesperson_id, checkin_at, checkin_latitude, checkin_longitude, checkin_accuracy, checkin_distance, checkout_at, checkout_latitude, checkout_longitude, duration_minutes, visit_result, notes, timestamps

### promotions
id, promo_code, name, description, promo_type (discount|bundle|cashback), start_date, end_date, minimum_qty, minimum_amount, discount_percent, discount_amount, customer_group, active, timestamps

### promo_offer_histories
id, customer_id, promo_id, salesperson_id, visit_id nullable, offered_at

### sales_orders
id, order_number (SO-STG-YYYY-######), customer_id, customer_po, salesperson_id, order_date, subtotal, discount, total, status, sync_status (NOT_REQUIRED|PENDING|SYNCED|FAILED), epicor_order_num nullable, client_uuid, timestamps

### sales_order_lines
id, order_id, product_id, qty, uom, unit_price, discount, line_total

### shipments / shipment_lines
Simulasi fulfillment staging.

### invoices / invoice_lines
invoice_number, customer_id, sales_order_id nullable, invoice_date, due_date, invoice_amount, paid_amount, balance, status, epicor_invoice_num nullable

### payments
id, customer_id, invoice_id, amount, method, reference, payment_date, salesperson_id, timestamps

### expenses
id, expense_number, salesperson_id, customer_id nullable, category, amount, note, expense_date, status (DRAFT|SUBMITTED|APPROVED|REJECTED|PAID), client_uuid, timestamps

### expense_attachments
id, expense_id, path, filename, mime, size

### return_requests
id, return_number, customer_id, salesperson_id, so_reference, reason, condition_notes, status (SUBMITTED|VERIFIED|APPROVED|RMA_ISSUED|REJECTED), rma_number nullable, timestamps

### return_request_lines
id, return_request_id, product_id, qty

### return_attachments
path, filename, mime, size

### notifications / audit_logs / integration_logs
Sesuai requirement security & audit.

## Indexes & Constraints

- Unique: customer_code, part_num, order_number, invoice_number, expense_number, return_number, rma_number, username, email, client_uuid per entity
- FK + index: salesperson_id, customer_id, product_id, invoice_id, order_id
- Index: stage, status, due_date, checkin_at, sync_status

## Aging (computed, bukan hardcode)

`days_overdue = max(0, TODAY - due_date)`  
Buckets: CURRENT (≤0), 1-30, 31-60, 60+

## Order / RMA numbering

Backend sequence:
- `SO-STG-2026-000001`
- `RMA-STG-2026-000001`
- `EXP-STG-2026-000001`
- `RET-STG-2026-000001`
- `INV-STG-2026-000001`
