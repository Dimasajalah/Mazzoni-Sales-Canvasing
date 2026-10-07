<?php
// backend/database/seeders/DemoPackagingSeeder.php

namespace Database\Seeders;

use App\Models\Competitor;
use App\Models\DiscountStratum;
use App\Models\Product;
use App\Models\ProductPackaging;
use Illuminate\Database\Seeder;

/**
 * DATA DEMO (bukan data resmi Mazzoni), aman dijalankan berulang di database yang sudah berisi data:
 *
 *     php artisan db:seed --class=DemoPackagingSeeder
 *
 * - kemasan: diturunkan dari nama produk (mis. "Saus Tomat 1kg" = 1000 gr) + dua opsi generik (500 gr, 20 gr)
 * - tier strata & kompetitor: sekadar contoh agar fitur Quotation bisa dicoba
 * Gramasi, tier strata, dan kompetitor yang sebenarnya harus diisi Mazzoni / tim functional.
 */
class DemoPackagingSeeder extends Seeder
{
    public function run(): void
    {
        foreach (Product::all() as $product) {
            $sizes = [500 => 'Pouch 500 gr', 20 => 'Sachet 20 gr'];

            if (preg_match('/(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml)\b/i', (string) $product->description, $m)) {
                $n = (float) str_replace(',', '.', $m[1]);
                $gram = strtolower($m[2]) === 'kg' ? $n * 1000 : $n;
                $sizes[(int) round($gram)] = trim($product->description);
            }

            foreach ($sizes as $gram => $name) {
                ProductPackaging::firstOrCreate(
                    ['product_id' => $product->id, 'gramasi_gr' => $gram],
                    ['name' => $name, 'active' => true]
                );
            }
        }

        foreach ([[100, 499, 2], [500, 999, 3], [1000, null, 5]] as [$min, $max, $pct]) {
            DiscountStratum::firstOrCreate(
                ['product_id' => null, 'min_kg' => $min],
                ['max_kg' => $max, 'discount_percent' => $pct, 'active' => true]
            );
        }

        foreach ([
            ['CV Saus Prima', 'Jl. Industri No. 5, Sidoarjo', '031-555-1020', 'sales@sausprima.example'],
            ['PT Bumbu Sejahtera', 'Jl. Rungkut Industri II, Surabaya', '031-844-7788', 'info@bumbusejahtera.example'],
        ] as [$name, $addr, $phone, $email]) {
            Competitor::firstOrCreate(['name' => $name], ['address' => $addr, 'phone' => $phone, 'email' => $email]);
        }
    }
}
