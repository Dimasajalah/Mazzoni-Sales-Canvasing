<?php

namespace App\Providers\Data\Staging;

use App\Models\Inventory;
use App\Providers\Data\Contracts\InventoryDataProviderInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class StagingInventoryProvider implements InventoryDataProviderInterface
{
    public function list(array $filters = [], int $perPage = 50): LengthAwarePaginator
    {
        $query = Inventory::query()->with('product');

        if (! empty($filters['warehouse'])) {
            $query->where('warehouse', $filters['warehouse']);
        }

        if (! empty($filters['q'])) {
            $q = $filters['q'];
            $query->whereHas('product', function ($builder) use ($q) {
                $builder->where('part_num', 'like', "%{$q}%")
                    ->orWhere('description', 'like', "%{$q}%");
            });
        }

        return $query->join('products', 'products.id', '=', 'inventories.product_id')
            ->orderBy('products.part_num')
            ->orderByRaw("CASE WHEN inventories.warehouse = 'Gudang SBY' THEN 0 ELSE 1 END")
            ->orderBy('inventories.warehouse')
            ->select('inventories.*')
            ->paginate($perPage)->through(
                fn (Inventory $row) => $this->flatten($row)
            );
    }

    public function byProduct(int $productId): Collection
    {
        return Inventory::with('product')
            ->where('product_id', $productId)
            ->get()
            ->map(fn (Inventory $row) => $this->flatten($row));
    }

    public function search(string $query, int $limit = 50): Collection
    {
        return Inventory::with('product')
            ->whereHas('product', function ($builder) use ($query) {
                $builder->where('part_num', 'like', "%{$query}%")
                    ->orWhere('description', 'like', "%{$query}%");
            })
            ->limit($limit)
            ->get()
            ->map(fn (Inventory $row) => $this->flatten($row));
    }

    private function flatten(Inventory $row): array
    {
        $product = $row->product;

        return [
            'id' => $row->id,
            'product_id' => $row->product_id,
            'part_num' => $product?->part_num,
            'description' => $product?->description,
            'name' => $product?->description,
            'sku' => $product?->part_num,
            'uom' => $product?->uom ?? 'DUS',
            'price' => $product ? (float) $product->price : 0,
            'warehouse' => $row->warehouse,
            'bin' => $row->bin,
            'loc' => trim(($row->warehouse ?? '').($row->bin ? ' · Bin '.$row->bin : '')),
            'on_hand_qty' => (float) $row->on_hand_qty,
            'allocated_qty' => (float) $row->allocated_qty,
            'available_qty' => (float) $row->available_qty,
            'q' => (float) $row->available_qty,
            'updated_at' => $row->updated_at,
            'product' => $product,
        ];
    }
}
