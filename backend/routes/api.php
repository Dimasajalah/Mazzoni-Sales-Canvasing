<?php

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

        Route::get('/users', [UserAdminController::class, 'index']);
        Route::post('/users', [UserAdminController::class, 'store']);
        Route::patch('/users/{id}', [UserAdminController::class, 'update']);

        // Quotation (Tahap 5)
        Route::get('/quotes', [QuoteController::class, 'index']);
        Route::post('/quotes', [QuoteController::class, 'store']);
        Route::get('/quotes/{id}', [QuoteController::class, 'show']);
        Route::patch('/quotes/{id}', [QuoteController::class, 'update']);
        Route::put('/quotes/{id}/lines', [QuoteController::class, 'replaceLines']);
        Route::post('/quotes/{id}/mark-quoted', [QuoteController::class, 'markQuoted']);
        Route::post('/quotes/{id}/competitors', [QuoteController::class, 'attachCompetitor']);
        Route::delete('/quotes/{id}/competitors/{competitorId}', [QuoteController::class, 'detachCompetitor']);
        Route::post('/quotes/{id}/convert-to-order', [QuoteController::class, 'convertToOrder']);

        Route::apiResource('customers', CustomerController::class);
        Route::get('/customers/{id}/aging', [ARController::class, 'customerAging']);

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
    });
});
