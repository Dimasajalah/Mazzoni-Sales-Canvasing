<?php

namespace App\Providers;

use App\Providers\Data\Contracts\ARDataProviderInterface;
use App\Providers\Data\Contracts\CustomerDataProviderInterface;
use App\Providers\Data\Contracts\InventoryDataProviderInterface;
use App\Providers\Data\Contracts\PaymentProviderInterface;
use App\Providers\Data\Contracts\SalesOrderProviderInterface;
use App\Providers\Data\Staging\StagingARProvider;
use App\Providers\Data\Staging\StagingCustomerProvider;
use App\Providers\Data\Staging\StagingInventoryProvider;
use App\Providers\Data\Staging\StagingPaymentProvider;
use App\Providers\Data\Staging\StagingSalesOrderProvider;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $source = config('canvassing.data_source', env('DATA_SOURCE', 'staging'));

        // Only staging is implemented. Epicor adapters will be bound here later.
        if ($source === 'staging' || $source === null || $source === '') {
            $this->app->bind(CustomerDataProviderInterface::class, StagingCustomerProvider::class);
            $this->app->bind(InventoryDataProviderInterface::class, StagingInventoryProvider::class);
            $this->app->bind(SalesOrderProviderInterface::class, StagingSalesOrderProvider::class);
            $this->app->bind(ARDataProviderInterface::class, StagingARProvider::class);
            $this->app->bind(PaymentProviderInterface::class, StagingPaymentProvider::class);

            return;
        }

        // Fallback to staging until Epicor providers exist
        $this->app->bind(CustomerDataProviderInterface::class, StagingCustomerProvider::class);
        $this->app->bind(InventoryDataProviderInterface::class, StagingInventoryProvider::class);
        $this->app->bind(SalesOrderProviderInterface::class, StagingSalesOrderProvider::class);
        $this->app->bind(ARDataProviderInterface::class, StagingARProvider::class);
        $this->app->bind(PaymentProviderInterface::class, StagingPaymentProvider::class);
    }

    public function boot(): void
    {
        //
    }
}
