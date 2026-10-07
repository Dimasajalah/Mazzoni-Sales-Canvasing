<?php

namespace App\Services;

use App\Models\Product;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

class ProductService
{
    public function list(array $filters = [], int $perPage = 50): LengthAwarePaginator
    {
        $q = $filters['q'] ?? null;
        $active = array_key_exists('active', $filters) ? filter_var($filters['active'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) : true;
        // Poin 21 (hasil meeting Okt 2026): saat bikin Penawaran untuk lead yang sudah lewat tahap
        // Sample, pencarian produk difilter ke Product Group sample yang sudah dicoba customer itu
        // — bukan dibatasi permanen, cuma dipakai kalau frontend eksplisit mengirim filter ini.
        $productGroup = $filters['product_group'] ?? null;

        return Product::query()
            ->when($active !== null, fn ($query) => $query->where('active', $active))
            ->when($productGroup, fn ($query) => $query->where('product_group', $productGroup))
            ->when($q, function ($query) use ($q) {
                $query->where(function ($w) use ($q) {
                    $w->where('part_num', 'like', "%{$q}%")
                        ->orWhere('description', 'like', "%{$q}%");
                });
            })
            ->orderBy('part_num')
            ->paginate($perPage);
    }

    public function find(int $id): ?Product
    {
        return Product::find($id);
    }
}
