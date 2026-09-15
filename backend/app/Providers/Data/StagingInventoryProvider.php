<?php

namespace App\Providers\Data;

use App\Contracts\InventoryDataProviderInterface;
use App\Models\Inventory;
use App\Models\Product;
use Illuminate\Support\Collection;

class StagingInventoryProvider implements InventoryDataProviderInterface
{
    public function search(?string $q = null, ?string $warehouse = null): Collection
    {
        $query = Inventory::with('product')->whereHas('product', fn ($p) => $p->where('active', true));

        if ($warehouse) {
            $query->where('warehouse', $warehouse);
        }
        if ($q) {
            $term = '%'.$q.'%';
            $query->whereHas('product', function ($p) use ($term) {
                $p->where('part_num', 'like', $term)->orWhere('description', 'like', $term);
            });
        }

        return $query->orderBy('warehouse')->get()->map(fn (Inventory $i) => [
            'id' => $i->id,
            'product_id' => $i->product_id,
            'part_num' => $i->product?->part_num,
            'description' => $i->product?->description,
            'uom' => $i->product?->uom,
            'price' => (float) $i->product?->price,
            'warehouse' => $i->warehouse,
            'bin' => $i->bin,
            'on_hand_qty' => (float) $i->on_hand_qty,
            'allocated_qty' => (float) $i->allocated_qty,
            'available_qty' => (float) $i->available_qty,
            'updated_at' => $i->updated_at,
        ]);
    }

    public function findByPartNum(string $partNum): ?array
    {
        $product = Product::where('part_num', $partNum)->first();
        if (! $product) {
            return null;
        }
        $rows = Inventory::where('product_id', $product->id)->get();

        return [
            'product' => $product,
            'inventories' => $rows,
            'total_on_hand' => $rows->sum('on_hand_qty'),
            'total_available' => $rows->sum('available_qty'),
        ];
    }
}
