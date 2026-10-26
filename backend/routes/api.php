<?php
//backend/routes/api.php
use App\Http\Controllers\Api\V1\LeadPromoController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\V1\ARController;
use App\Http\Controllers\Api\V1\CodeMappingController;
use App\Http\Controllers\Api\V1\CompetitorController;
use App\Http\Controllers\Api\V1\DelegationController;
use App\Http\Controllers\Api\V1\DiscountStrataController;
use App\Http\Controllers\Api\V1\ProductPackagingController;
use App\Http\Controllers\Api\V1\QuoteController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\UserAdminController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\ExpenseController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\LeadJourneyController;
use App\Http\Controllers\Api\V1\LeadTaskController;
use App\Http\Controllers\Api\V1\PromotionController;
use App\Http\Controllers\Api\V1\ReturnController;
use App\Http\Controllers\Api\V1\SalesOrderController;
use App\Http\Controllers\Api\V1\SearchController;
use App\Http\Controllers\Api\V1\VisitController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\ProductSampleController;
use App\Http\Controllers\Api\V1\CashAdvanceNotificationController;
use App\Http\Controllers\Api\V1\MarketingBudgetController;
use App\Http\Controllers\Api\V1\MarketingEventController;
use App\Http\Controllers\Api\V1\StarOutletController;
use App\Http\Controllers\Api\V1\MarketingClaimProgramController;
use App\Http\Controllers\Api\V1\MarketingApprovalController;
use App\Http\Controllers\Api\V1\MarketingSelloutController;
use App\Http\Controllers\Api\V1\MarketingClaimController;
use App\Http\Controllers\Api\V1\MarketingClaimDeductionController;
use App\Http\Controllers\Api\V1\MarketingCreditMemoController;
use App\Http\Controllers\Api\V1\MarketingTransferController;
use App\Http\Controllers\Api\V1\MarketingGoodsController;
use App\Http\Controllers\Api\V1\PurchaseRequisitionController;
use App\Http\Controllers\Api\V1\MarketingMoveRequestController;
use App\Http\Controllers\Api\V1\MarketingSampleRequestController;
use App\Http\Controllers\Api\V1\MarketingIssueController;
use App\Http\Controllers\Api\V1\SalesAchievementController;
use App\Http\Controllers\Api\V1\CashAdvanceController;
use Illuminate\Support\Facades\Route;

Route::get('/health', [HealthController::class, 'health']);
Route::get('/health/database', [HealthController::class, 'database']);

Route::prefix('v1')->group(function () {
    Route::post('/auth/login', [AuthController::class, 'login']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::get('/me', [AuthController::class, 'me']);

        Route::get('/dashboard', [DashboardController::class, 'index']);
        Route::get('/search', [SearchController::class, 'index']);

        Route::apiResource('leads', LeadController::class);
        Route::post('/leads/{id}/followups', [LeadController::class, 'followup']);
        Route::post('/leads/{lead}/followup', [LeadController::class, 'followup']);
        Route::post('/leads/{id}/photo', [LeadController::class, 'photo']);

        // Mesin tugas & journey (FDD 4.3, poin 2-3)
        Route::get('/leads/{id}/tasks', [LeadTaskController::class, 'forLead']);
        Route::get('/leads/{id}/journey-entries', [LeadJourneyController::class, 'index']);
        Route::post('/leads/{id}/journey-entries', [LeadJourneyController::class, 'store']);
        Route::get('/lead-tasks', [LeadTaskController::class, 'index']);
        Route::patch('/lead-tasks/{id}', [LeadTaskController::class, 'update']);
        Route::post('/lead-tasks/{id}/conclude', [LeadTaskController::class, 'conclude']);
        Route::get('/task-templates', [TaskController::class, 'templates']);
        Route::post('/quotes/{id}/lines/replace', [QuoteController::class, 'replaceLines']);
        Route::get('/quotes/{id}/approved-samples', [QuoteController::class, 'approvedSamples']);
        Route::get('/quotes/{id}/product-search', [QuoteController::class, 'productSearch']);
        Route::get('/marketing/star-outlet-candidates', [StarOutletController::class, 'candidates']);
        Route::get('/marketing/star-outlets', [StarOutletController::class, 'index']);
        Route::post('/marketing/star-outlets', [StarOutletController::class, 'store']);
        Route::patch('/marketing/star-outlets/{id}', [StarOutletController::class, 'update']);
        Route::post('/marketing/events/{id}/approve', [MarketingEventController::class, 'approve']);
        Route::post('/marketing/events/{id}/reject', [MarketingEventController::class, 'reject']);
        Route::post('/marketing/events/{id}/revise', [MarketingEventController::class, 'revise']);
        Route::get('/marketing/approvals/pending', [MarketingApprovalController::class, 'pending']);
        Route::get('/marketing/claim-programs/{id}/sellout/template', [MarketingSelloutController::class, 'template']);
        Route::get('/marketing/claim-programs/{id}/sellout', [MarketingSelloutController::class, 'panel']);
        Route::post('/marketing/claim-programs/{id}/sellout', [MarketingSelloutController::class, 'upload']);
        Route::get('/marketing/claims/options', [MarketingClaimController::class, 'options']);
        Route::get('/marketing/claims', [MarketingClaimController::class, 'index']);
        Route::post('/marketing/claims', [MarketingClaimController::class, 'store']);
        Route::get('/marketing/claims/{id}', [MarketingClaimController::class, 'show'])->whereNumber('id');
        Route::post('/marketing/claims/{id}/pass', [MarketingClaimController::class, 'pass'])->whereNumber('id');
        Route::post('/marketing/claims/{id}/refuse', [MarketingClaimController::class, 'refuse'])->whereNumber('id');
        Route::post('/marketing/claims/{id}/calculate', [MarketingClaimController::class, 'calculate'])->whereNumber('id');
        Route::post('/marketing/claims/{id}/submit', [MarketingClaimController::class, 'submit'])->whereNumber('id');
        Route::post('/marketing/claims/{id}/confirm-difference', [MarketingClaimController::class, 'confirmDifference'])->whereNumber('id');
        Route::post('/marketing/claims/{id}/approve', [MarketingClaimController::class, 'approve'])->whereNumber('id');
        Route::post('/marketing/claims/{id}/reject', [MarketingClaimController::class, 'reject'])->whereNumber('id');
        Route::post('/marketing/claims/{id}/approved-amount', [MarketingClaimController::class, 'approvedAmount'])->whereNumber('id');
        Route::get('/marketing/credit-memo-claims', [MarketingCreditMemoController::class, 'index']);
        Route::get('/marketing/credit-memo-claims/{id}', [MarketingCreditMemoController::class, 'show'])->whereNumber('id');
        Route::post('/marketing/credit-memo-claims/{id}/entry', [MarketingCreditMemoController::class, 'entry'])->whereNumber('id');
        Route::post('/marketing/credit-memo-claims/{id}/post', [MarketingCreditMemoController::class, 'post'])->whereNumber('id');
        Route::post('/marketing/credit-memo-claims/{id}/apply', [MarketingCreditMemoController::class, 'apply'])->whereNumber('id');
        Route::get('/marketing/transfer-claims', [MarketingTransferController::class, 'index']);
        Route::get('/marketing/transfer-claims/{id}', [MarketingTransferController::class, 'show'])->whereNumber('id');
        Route::post('/marketing/transfer-claims/{id}/entry', [MarketingTransferController::class, 'entry'])->whereNumber('id');
        Route::post('/marketing/transfer-claims/{id}/transferred', [MarketingTransferController::class, 'transferred'])->whereNumber('id');
        Route::get('/marketing/goods-claims', [MarketingGoodsController::class, 'index']);
        Route::get('/marketing/goods-claims/{id}', [MarketingGoodsController::class, 'show'])->whereNumber('id');
        Route::post('/marketing/goods-claims/{id}/items', [MarketingGoodsController::class, 'items'])->whereNumber('id');
        Route::post('/marketing/goods-claims/{id}/stock-check', [MarketingGoodsController::class, 'stockCheck'])->whereNumber('id');
        Route::post('/marketing/goods-claims/{id}/requisition', [MarketingGoodsController::class, 'requisition'])->whereNumber('id');
        Route::post('/marketing/goods-claims/{id}/receipt', [MarketingGoodsController::class, 'receipt'])->whereNumber('id');
        Route::post('/marketing/goods-claims/{id}/shipment', [MarketingGoodsController::class, 'shipment'])->whereNumber('id');
        Route::post('/marketing/goods-claims/{id}/issue', [MarketingGoodsController::class, 'issue'])->whereNumber('id');
        Route::post('/marketing/goods-claims/{id}/handover', [MarketingGoodsController::class, 'handover'])->whereNumber('id');
        Route::get('/marketing/move-requests', [MarketingMoveRequestController::class, 'index']);
        Route::get('/marketing/move-requests/events', [MarketingMoveRequestController::class, 'events']);
        Route::post('/marketing/move-requests', [MarketingMoveRequestController::class, 'store']);
        Route::get('/marketing/move-requests/{id}', [MarketingMoveRequestController::class, 'show'])->whereNumber('id');
        Route::put('/marketing/move-requests/{id}', [MarketingMoveRequestController::class, 'update'])->whereNumber('id');
        Route::post('/marketing/move-requests/{id}/onhand', [MarketingMoveRequestController::class, 'onhand'])->whereNumber('id');
        Route::post('/marketing/move-requests/{id}/move-request', [MarketingMoveRequestController::class, 'moveRequest'])->whereNumber('id');
        Route::post('/marketing/move-requests/{id}/transfer', [MarketingMoveRequestController::class, 'transfer'])->whereNumber('id');
        Route::post('/marketing/move-requests/{id}/issue', [MarketingMoveRequestController::class, 'issue'])->whereNumber('id');
        Route::post('/marketing/move-requests/{id}/complete', [MarketingMoveRequestController::class, 'complete'])->whereNumber('id');

        // Kemasan/gramasi, strata, mapping kode, kompetitor (Tahap 4-5)
        Route::get('/product-packagings', [ProductPackagingController::class, 'index']);
        Route::post('/product-packagings', [ProductPackagingController::class, 'store']);
        Route::patch('/product-packagings/{id}', [ProductPackagingController::class, 'update']);
        Route::delete('/product-packagings/{id}', [ProductPackagingController::class, 'destroy']);

        Route::get('/discount-strata', [DiscountStrataController::class, 'index']);
        Route::get('/discount-strata/preview', [DiscountStrataController::class, 'preview']);
        Route::post('/discount-strata', [DiscountStrataController::class, 'store']);
        Route::patch('/discount-strata/{id}', [DiscountStrataController::class, 'update']);
        Route::delete('/discount-strata/{id}', [DiscountStrataController::class, 'destroy']);
        Route::get('/marketing/budgets', [MarketingBudgetController::class, 'index']);
        Route::post('/marketing/budgets', [MarketingBudgetController::class, 'store']);
        Route::get('/marketing/budgets/{id}', [MarketingBudgetController::class, 'show']);
        Route::patch('/marketing/budgets/{id}', [MarketingBudgetController::class, 'update']);

        Route::get('/marketing/claim-program-options', [MarketingClaimProgramController::class, 'options']);
        Route::get('/marketing/claim-programs', [MarketingClaimProgramController::class, 'index']);
        Route::post('/marketing/claim-programs', [MarketingClaimProgramController::class, 'store']);
        Route::get('/marketing/claim-programs/{id}', [MarketingClaimProgramController::class, 'show']);
        Route::post('/marketing/claim-programs/{id}/approve', [MarketingClaimProgramController::class, 'approve']);
        Route::post('/marketing/claim-programs/{id}/reject', [MarketingClaimProgramController::class, 'reject']);
        Route::get('/marketing/deduction-claims', [MarketingClaimDeductionController::class, 'index']);
        Route::get('/marketing/deduction-claims/{id}', [MarketingClaimDeductionController::class, 'show'])->whereNumber('id');
        Route::post('/marketing/deduction-claims/{id}/post-invoice', [MarketingClaimDeductionController::class, 'post'])->whereNumber('id');
        Route::get('/marketing/sample-requests', [MarketingSampleRequestController::class, 'index']);
        Route::post('/marketing/sample-requests', [MarketingSampleRequestController::class, 'store']);
        Route::get('/marketing/sample-requests/{id}', [MarketingSampleRequestController::class, 'show'])->whereNumber('id');
        Route::put('/marketing/sample-requests/{id}', [MarketingSampleRequestController::class, 'update'])->whereNumber('id');
        Route::post('/marketing/sample-requests/{id}/onhand', [MarketingSampleRequestController::class, 'onhand'])->whereNumber('id');
        Route::post('/marketing/sample-requests/{id}/move-request', [MarketingSampleRequestController::class, 'moveRequest'])->whereNumber('id');
        Route::post('/marketing/sample-requests/{id}/transfer', [MarketingSampleRequestController::class, 'transfer'])->whereNumber('id');
        Route::post('/marketing/sample-requests/{id}/issue', [MarketingSampleRequestController::class, 'issue'])->whereNumber('id');
        Route::post('/marketing/sample-requests/{id}/complete', [MarketingSampleRequestController::class, 'complete'])->whereNumber('id');

        Route::get('/cash-advance/notifications', [CashAdvanceNotificationController::class, 'index']);
        Route::post('/cash-advance/notifications/read-all', [CashAdvanceNotificationController::class, 'readAll']);
        Route::post('/cash-advance/notifications/{id}/read', [CashAdvanceNotificationController::class, 'read']);

        Route::get('/code-mappings', [CodeMappingController::class, 'index']);
        Route::post('/code-mappings', [CodeMappingController::class, 'store']);
        Route::delete('/code-mappings/{id}', [CodeMappingController::class, 'destroy']);

        Route::get('/competitors', [CompetitorController::class, 'index']);
        Route::post('/competitors', [CompetitorController::class, 'store']);

        // Peran, delegasi, dan laporan NOO (Tahap 7)
        Route::get('/delegation-targets', [DelegationController::class, 'targets']);
        Route::get('/delegations', [DelegationController::class, 'index']);
        Route::post('/delegations/{id}/cancel', [DelegationController::class, 'cancel']);
        Route::post('/leads/{id}/delegate', [DelegationController::class, 'delegate']);
        Route::get('/leads/{id}/delegation', [DelegationController::class, 'forLead']);
        Route::get('/reports/noo', [ReportController::class, 'noo']);

        Route::get('/marketing/event-options', [MarketingEventController::class, 'options']);
        Route::get('/marketing/events', [MarketingEventController::class, 'index']);
        Route::post('/marketing/events', [MarketingEventController::class, 'store']);
        Route::get('/marketing/events/{id}', [MarketingEventController::class, 'show']);

        Route::get('/users', [UserAdminController::class, 'index']);
        Route::post('/users', [UserAdminController::class, 'store']);
        Route::patch('/users/{id}', [UserAdminController::class, 'update']);

        // Quotation (Tahap 5)
        Route::get('/quotes', [QuoteController::class, 'index']);
        Route::post('/quotes', [QuoteController::class, 'store']);
        Route::get('/quotes/{id}', [QuoteController::class, 'show']);
        Route::patch('/quotes/{id}', [QuoteController::class, 'update']);
        Route::post('/quotes/{id}/header', [QuoteController::class, 'update']);
        Route::get('/quotes/{id}/pdf', [QuoteController::class, 'pdf']);
        Route::put('/quotes/{id}/lines', [QuoteController::class, 'replaceLines']);
        Route::post('/quotes/{id}/mark-quoted', [QuoteController::class, 'markQuoted']);
        Route::post('/quotes/{id}/competitors', [QuoteController::class, 'attachCompetitor']);
        Route::delete('/quotes/{id}/competitors/{competitorId}', [QuoteController::class, 'detachCompetitor']);
        Route::post('/quotes/{id}/convert-to-order', [QuoteController::class, 'convertToOrder']);
        Route::get('/leads/{id}/promos', [LeadPromoController::class, 'index']);
        Route::post('/leads/{id}/promos', [LeadPromoController::class, 'apply']);
        Route::post('/leads/{id}/promos/remove', [LeadPromoController::class, 'remove']);
        Route::post('/quotes/{id}/lines/{lineId}/bind-part', [QuoteController::class, 'bindPart']);
        Route::post('/quotes/{id}/checkout', [QuoteController::class, 'convertToOrder']);

        Route::apiResource('customers', CustomerController::class);
        Route::get('/customers/{id}/aging', [ARController::class, 'customerAging']);
        Route::get('/customers/{id}/activity', [CustomerController::class, 'activity']);
        Route::get('/customers/{id}/pic-targets', [CustomerController::class, 'picTargets']);
        Route::post('/customers/{id}/delegate-pic', [CustomerController::class, 'delegatePic']);

        Route::get('/visits', [VisitController::class, 'index']);
        Route::get('/visits/{id}', [VisitController::class, 'show']);
        Route::post('/visits/checkin', [VisitController::class, 'checkin']);
        Route::post('/visits/{id}/checkout', [VisitController::class, 'checkout']);

        Route::get('/inventory', [InventoryController::class, 'index']);
        Route::get('/products', [InventoryController::class, 'products']);
        Route::get('/product-groups', [InventoryController::class, 'productGroups']);
        Route::patch('/products/{id}/moq', [InventoryController::class, 'setMoq']);
        Route::patch('/products/{id}/registration', [InventoryController::class, 'setRegistration']);
        Route::post('/products/{id}/revise', [InventoryController::class, 'reviseProduct']);
        Route::get('/inventory/products/{productId}', [InventoryController::class, 'byProduct']);

        Route::get('/promotions', [PromotionController::class, 'index']);
        Route::get('/promotions/{id}', [PromotionController::class, 'show']);
        Route::post('/promotions/offer', [PromotionController::class, 'offer']);
        Route::get('/customers/{id}/promo-offers', [PromotionController::class, 'customerHistory']);

        Route::get('/samples', [ProductSampleController::class, 'index']);
        Route::post('/samples', [ProductSampleController::class, 'store']);
        Route::post('/samples/{id}/deliver', [ProductSampleController::class, 'deliver']);

        Route::get('/sample-feedbacks', [ProductSampleController::class, 'feedbackIndex']);
        Route::post('/sample-feedbacks', [ProductSampleController::class, 'feedbackStore']);

        Route::get('/orders', [SalesOrderController::class, 'index']);
        Route::post('/orders', [SalesOrderController::class, 'store']);
        Route::get('/orders/{id}', [SalesOrderController::class, 'show']);
        Route::get('/orders/{id}/tracker', [SalesOrderController::class, 'tracker']);

        Route::get('/ar/aging', [ARController::class, 'aging']);
        Route::get('/invoices', [ARController::class, 'invoices']);
        Route::get('/invoices/{id}', [ARController::class, 'showInvoice']);
        Route::get('/payments', [ARController::class, 'payments']);
        Route::post('/payments', [ARController::class, 'storePayment']);

        Route::get('/expenses', [ExpenseController::class, 'index']);
        Route::post('/expenses', [ExpenseController::class, 'store']);
        Route::get('/expenses/{id}', [ExpenseController::class, 'show']);
        Route::patch('/expenses/{id}/status', [ExpenseController::class, 'updateStatus']);

        Route::get('/returns', [ReturnController::class, 'index']);
        Route::post('/returns', [ReturnController::class, 'store']);
        Route::get('/returns/{id}', [ReturnController::class, 'show']);
        Route::patch('/returns/{id}/status', [ReturnController::class, 'updateStatus']);

        Route::get('/task-sets', [TaskController::class, 'taskSets']);
        Route::get('/task-types', [TaskController::class, 'taskTypes']);
        Route::get('/tasks', [TaskController::class, 'tasks']);

        Route::get('/purchasing/requisitions', [PurchaseRequisitionController::class, 'index']);
        Route::post('/purchasing/requisitions', [PurchaseRequisitionController::class, 'store']);
        Route::get('/purchasing/requisitions/{id}', [PurchaseRequisitionController::class, 'show'])->whereNumber('id');
        Route::put('/purchasing/requisitions/{id}', [PurchaseRequisitionController::class, 'update'])->whereNumber('id');
        Route::post('/purchasing/requisitions/{id}/attachments', [PurchaseRequisitionController::class, 'attachments'])->whereNumber('id');
        Route::post('/purchasing/requisitions/{id}/submit', [PurchaseRequisitionController::class, 'submit'])->whereNumber('id');
        Route::post('/purchasing/requisitions/{id}/lines/{lineId}/register', [PurchaseRequisitionController::class, 'registerPart'])->whereNumber(['id', 'lineId']);
        Route::post('/purchasing/requisitions/{id}/prices', [PurchaseRequisitionController::class, 'prices'])->whereNumber('id');
        Route::post('/purchasing/requisitions/{id}/approve', [PurchaseRequisitionController::class, 'approve'])->whereNumber('id');
        Route::post('/purchasing/requisitions/{id}/reject', [PurchaseRequisitionController::class, 'reject'])->whereNumber('id');
        Route::post('/purchasing/requisitions/{id}/resubmit', [PurchaseRequisitionController::class, 'resubmit'])->whereNumber('id');
        Route::post('/purchasing/requisitions/{id}/dispatch', [PurchaseRequisitionController::class, 'forwardToPurchasing'])->whereNumber('id');

        Route::get('/marketing/issues', [MarketingIssueController::class, 'index']);
        Route::post('/marketing/issues', [MarketingIssueController::class, 'store']);
        Route::get('/marketing/issues/{id}', [MarketingIssueController::class, 'show'])->whereNumber('id');
        Route::put('/marketing/issues/{id}', [MarketingIssueController::class, 'update'])->whereNumber('id');
        Route::post('/marketing/issues/{id}/complete', [MarketingIssueController::class, 'complete'])->whereNumber('id');
        Route::get('/marketing/achievement', [SalesAchievementController::class, 'panel']);
        Route::get('/marketing/achievement/template', [SalesAchievementController::class, 'template']);
        Route::post('/marketing/achievement', [SalesAchievementController::class, 'upload']);
        Route::get('/marketing/achievement/me', [SalesAchievementController::class, 'mine']);

        Route::get('/cash-advance/summary', [CashAdvanceController::class, 'summary']);
        Route::get('/cash-advance/categories', [CashAdvanceController::class, 'categories']);
        Route::get('/cash-advance/documents', [CashAdvanceController::class, 'documents']);

        Route::post('/cash-advance/issues', [CashAdvanceController::class, 'store']);
        Route::post('/cash-advance/issues/{issue}/attachments', [CashAdvanceController::class, 'uploadAttachments']);
    });
});
