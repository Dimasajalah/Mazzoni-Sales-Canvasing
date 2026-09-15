# Epicor Integration Plan (DOKUMENTASI SAJA)

**Status: BELUM DIIMPLEMENTASIKAN.**  
Tahap sekarang hanya staging database.

## Mapping Entity

| Staging Entity | Future Epicor Entity / API |
|----------------|----------------------------|
| Customer | Customer / CustomerSvc |
| Product | Part |
| Inventory | PartWhse / Inventory Qty API |
| Sales Order | SalesOrder / SalesOrderSvc |
| Shipment | Customer Shipment / Pack |
| Invoice | AR Invoice / ARInvoiceSvc |
| Payment | Cash Receipt |
| Return / RMA | RMA service |
| Lead / Visit / Expense | Tetap staging app (non-Epicor master) |

## Field Mapping (nullable sekarang)

| Staging Field | Epicor |
|---------------|--------|
| epicor_customer_num | Customer.CustNum / CustID |
| epicor_part_num | Part.PartNum |
| epicor_order_num | OrderHed.OrderNum |
| epicor_invoice_num | InvcHead.InvoiceNum |
| epicor_pack_num | ShipHead.PackNum |
| epicor_rma_num | RMAHead.RMANum |

## Sync Strategy (nanti)

1. `sync_status`: NOT_REQUIRED | PENDING | SYNCED | FAILED  
2. Order dibuat staging dulu → queue → EpicorSalesOrderProvider  
3. `integration_logs` menyimpan request/response  
4. Frontend tidak berubah; Service memanggil Provider yang di-bind

## Yang TIDAK dikerjakan sekarang

- EPICOR_BASE_URL / USERNAME / PASSWORD / API_KEY  
- BAQ, SalesOrderSvc, CustomerSvc, ARInvoiceSvc, RMA, Cash Receipt  
- Direct SQL ke Epicor SQL Server  

## Uji koneksi Epicor (sebelum coding adapter)

Checklist + koleksi Postman (read-only smoke test):

- [EPICOR_POSTMAN_CHECKLIST.md](./EPICOR_POSTMAN_CHECKLIST.md)
- Import: `docs/postman/Epicor_Kinetic_Smoke_Test.postman_collection.json`
- Environment: `docs/postman/Epicor_Kinetic.environment.json`
