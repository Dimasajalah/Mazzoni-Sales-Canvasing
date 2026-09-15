<?php

use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\V1\ARController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\ExpenseController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\PromotionController;
use App\Http\Controllers\Api\V1\ReturnController;
use App\Http\Controllers\Api\V1\SalesOrderController;
use App\Http\Controllers\Api\V1\SearchController;
use App\Http\Controllers\Api\V1\VisitController;
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

        Route::apiResource('customers', CustomerController::class);
        Route::get('/customers/{id}/aging', [ARController::class, 'customerAging']);

        Route::get('/visits', [VisitController::class, 'index']);
        Route::get('/visits/{id}', [VisitController::class, 'show']);
        Route::post('/visits/checkin', [VisitController::class, 'checkin']);
        Route::post('/visits/{id}/checkout', [VisitController::class, 'checkout']);

        Route::get('/inventory', [InventoryController::class, 'index']);
        Route::get('/products', [InventoryController::class, 'products']);
        Route::get('/inventory/products/{productId}', [InventoryController::class, 'byProduct']);

        Route::get('/promotions', [PromotionController::class, 'index']);
        Route::get('/promotions/{id}', [PromotionController::class, 'show']);
        Route::post('/promotions/offer', [PromotionController::class, 'offer']);

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
    });
});
