<?php
// backend/app/Services/QuoteService.php

namespace App\Services;

use App\Models\Competitor;
use App\Models\Lead;
use App\Models\LeadTask;
use App\Models\ProductSample;
use App\Models\Product;
use App\Models\ProductPackaging;
use App\Models\Quote;
use App\Models\QuoteCompetitor;
use App\Models\QuoteLine;
use App\Models\SalesOrder;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Quotation (FDD 4.6). Baris dihitung dari Kg: pcs = Kg x 1000 / gramasi,
 * nilai = pcs x harga per pcs x (1 - (diskon manual + strata)%).
 */
class QuoteService
{
    /** Poin 14: pilihan termin pembayaran yang valid. */
    public const PAYMENT_TERMS = ['15D', '30D', '45D', 'COD'];

    private const HEADER_FIELDS = [
        'lead_id',
        'customer_id',
        'product_sample_id',
        'customer_po',
        'due_date',
        'expected_close_date',
        'follow_up_date',
        'expires_at',
        'terms',
        'payment_term',
        'notes',
        'currency',
        'client_uuid',
    ];

    private const WITH = [
        'lead:id,business_name,stage,win_loss,task_set_id',
        'customer:id,name,customer_code',
        'salesperson:id,name',
        'sample:id,flavor_variant,version,qty,product_group',
        'lines.product:id,part_num,description,epicor_part_num,product_group,revision',
        'lines.packaging',
        'competitors',
        'order:id,quote_id,order_number',
    ];

    public function __construct(
        private readonly PackagingService $packaging,
        private readonly SalesOrderService $orders,
        private readonly AuditLogService $auditLogService,
    ) {}

    public function list(array $filters = [], int $perPage = 20): LengthAwarePaginator
    {
        return Quote::query()
            ->with(['lead:id,business_name,stage,win_loss', 'customer:id,name,customer_code', 'salesperson:id,name'])
            ->withCount('lines')
            ->when(! empty($filters['lead_id']), fn($q) => $q->where('lead_id', $filters['lead_id']))
            ->when(! empty($filters['customer_id']), fn($q) => $q->where('customer_id', $filters['customer_id']))
            ->when(! empty($filters['status']), fn($q) => $q->where('status', $filters['status']))
            ->when(! empty($filters['salesperson_id']), fn($q) => $q->where('salesperson_id', $filters['salesperson_id']))
            ->when(! empty($filters['q']), fn($q) => $q->where('quote_number', 'like', '%' . $filters['q'] . '%'))
            ->latest('id')
            ->paginate($perPage);
    }

    public function find(int $id): ?Quote
    {
        $quote = Quote::with(self::WITH)->find($id);
        if (! $quote) {
            return null;
        }

        $quote->append(['sample_product_group', 'source_followup']);
        $this->attachLineSources($quote);

        return $quote;
    }

    public function create(array $data, array $lines, User $user): Quote
    {
        if (! empty($data['client_uuid'])) {
            $existing = Quote::where('client_uuid', $data['client_uuid'])->first();
            if ($existing) {
                return $existing->load(self::WITH);
            }
        }

        return DB::transaction(function () use ($data, $lines, $user) {
            $quote = Quote::create([
                ...Arr::only($data, self::HEADER_FIELDS),
                'quote_number' => $this->nextNumber(),
                'salesperson_id' => $user->id,
                'status' => Quote::DRAFT,
                'entry_date' => now()->toDateString(),
            ]);

            $this->replaceLines($quote, $lines);
            $this->auditLogService->log($user->id, 'quote.create', Quote::class, $quote->id, null, $quote->toArray());

            return $quote->load(self::WITH);
        });
    }

    public function update(Quote $quote, array $data, User $user): Quote
    {
        $this->assertOpen($quote);
        $old = $quote->toArray();
        $quote->update(Arr::only($data, array_diff(self::HEADER_FIELDS, ['client_uuid', 'lead_id'])));
        $this->auditLogService->log($user->id, 'quote.update', Quote::class, $quote->id, $old, $quote->fresh()->toArray());

        return $quote->load(self::WITH);
    }

    /** Ganti seluruh baris penawaran (transaksional) lalu hitung ulang total. */
    public function replaceLines(Quote $quote, array $lines): Quote
    {
        $this->assertOpen($quote);

        return DB::transaction(function () use ($quote, $lines) {
            $quote->lines()->delete();

            $subtotal = 0.0;
            $total = 0.0;

            foreach (array_values($lines) as $i => $line) {
                if (! empty($line['product_id'])) {
                    $product = Product::findOrFail($line['product_id']);
                } else {
                    // Add Line (dokumen hal. 35): Line baru dari sample yang disetujui; sample harus milik prospek ini.
                    $sample = ProductSample::where('id', $line['sample_id'] ?? 0)->where('lead_id', $quote->lead_id)->first();
                    if (! $sample) {
                        throw ValidationException::withMessages(["lines.{$i}.sample_id" => ['Sample tidak ditemukan untuk prospek ini.']]);
                    }
                    $product = $this->placeholderProductFor($sample);
                }
                $packaging = null;

                if (! empty($line['packaging_id'])) {
                    $packaging = ProductPackaging::where('id', $line['packaging_id'])
                        ->where('product_id', $product->id)
                        ->first();
                    if (! $packaging) {
                        throw ValidationException::withMessages([
                            "lines.{$i}.packaging_id" => ['Kemasan tidak sesuai dengan produk yang dipilih.'],
                        ]);
                    }
                }

                $gramasi = $packaging ? (float) $packaging->gramasi_gr : (float) ($line['gramasi_gr'] ?? 0);
                if ($gramasi <= 0) {
                    throw ValidationException::withMessages([
                        "lines.{$i}.gramasi_gr" => ['Pilih kemasan atau isi gramasi (gr per pcs).'],
                    ]);
                }

                $kg = (float) $line['qty_kg'];

                // Poin 17: MOQ (Minimum Order Quantity) untuk produk sample custom B2B tertentu.
                if ($product->moq_kg !== null && $kg < (float) $product->moq_kg) {
                    throw ValidationException::withMessages([
                        "lines.{$i}.qty_kg" => ["Jumlah order minimal {$product->moq_kg} Kg untuk produk ini (MOQ)."],
                    ]);
                }

                $pcs = $this->packaging->kgToPcs($kg, $gramasi);
                // Dokumen hal. 34: Qty Converted (PCS) otomatis dari Qty Order ÷ Packaging, tetapi boleh ditimpa
                // bila jumlah kemasan sebenarnya berbeda.
                if (isset($line['qty_pcs']) && (float) $line['qty_pcs'] > 0) {
                    $pcs = $line['qty_pcs'];
                }
                $price = isset($line['unit_price']) ? (float) $line['unit_price'] : (float) $product->price;
                $strata = $this->packaging->strataPercent($product->id, $kg);
                // Poin 15: diskon bertingkat — strata dulu, lalu Disc 1-4, tiap kolom memotong sisa harga.
                $disc1 = (float) ($line['disc1_percent'] ?? 0);
                $disc2 = (float) ($line['disc2_percent'] ?? 0);
                $disc3 = (float) ($line['disc3_percent'] ?? 0);
                $disc4 = (float) ($line['disc4_percent'] ?? 0);
                $effective = QuoteLine::cascadePercent([$strata, $disc1, $disc2, $disc3, $disc4]);

                $gross = $pcs * $price;
                $lineTotal = round($gross * (1 - $effective / 100), 2);

                $created = QuoteLine::create([
                    'quote_id' => $quote->id,
                    'product_id' => $product->id,
                    'description' => $product->description,
                    'qty_kg' => $kg,
                    'packaging_id' => $packaging?->id,
                    'gramasi_gr' => $gramasi,
                    'qty_pcs' => $pcs,
                    'uom' => 'PCS',
                    'unit_price' => $price,
                    'strata_percent' => $strata,
                    'disc1_percent' => $disc1,
                    'disc2_percent' => $disc2,
                    'disc3_percent' => $disc3,
                    'disc4_percent' => $disc4,
                    'line_total' => $lineTotal,
                    ]);
    
                    if (! empty($line['sample_id'])) {
                        QuoteLine::whereKey($created->id)->update(['product_sample_id' => $line['sample_id']]);
                    }

                $subtotal += $gross;
                $total += $lineTotal;
            }

            $quote->update([
                'subtotal' => round($subtotal, 2),
                'discount_total' => round($subtotal - $total, 2),
                'total' => round($total, 2),
            ]);

            return $quote->load(self::WITH);
        });
    }

    public function markQuoted(Quote $quote, User $user): Quote
    {
        $this->assertOpen($quote);

        if (! $quote->lines()->exists()) {
            throw ValidationException::withMessages(['quote' => ['Tambahkan minimal 1 baris sebelum menandai Quoted.']]);
        }

        $quote->update([...$this->quotedStamp($quote), 'status' => Quote::QUOTED]);
        $this->auditLogService->log($user->id, 'quote.quoted', Quote::class, $quote->id, null, $quote->toArray());

        return $quote->load(self::WITH);
    }

    public function attachCompetitor(Quote $quote, array $data): Quote
    {
        $this->assertOpen($quote);

        $competitor = ! empty($data['competitor_id'])
            ? Competitor::findOrFail($data['competitor_id'])
            : Competitor::create(Arr::only($data, ['name', 'address', 'phone', 'email']));

        QuoteCompetitor::updateOrCreate(
            ['quote_id' => $quote->id, 'competitor_id' => $competitor->id],
            ['comment' => $data['comment'] ?? null]
        );

        return $quote->load(self::WITH);
    }

    public function detachCompetitor(Quote $quote, int $competitorId): Quote
    {
        $this->assertOpen($quote);
        QuoteCompetitor::where('quote_id', $quote->id)->where('competitor_id', $competitorId)->delete();

        return $quote->load(self::WITH);
    }

    /** Nomor Quote terbit saat tugas pertama prospek dikerjakan (FDD 4.3 / 4.6). */
    public function ensureDraftForLead(Lead $lead, User $user): Quote
    {
        $existing = Quote::where('lead_id', $lead->id)->latest('id')->first();

        return $existing ?? $this->create(['lead_id' => $lead->id], [], $user);
    }

    /** Prospek ditutup: penawaran yang masih berjalan ikut menjadi WON / LOST. */
    public function syncFromLead(Lead $lead, string $result): void
    {
        $quotes = Quote::where('lead_id', $lead->id)->whereIn('status', [Quote::DRAFT, Quote::QUOTED])->get();

        foreach ($quotes as $quote) {
            if ($result === 'WIN') {
                // Quoted otomatis saat konklusi menjadi Win (dokumen hal. 32); tanggal Quoted dan Expires terisi.
                $quote->update(['status' => Quote::WON, ...$this->quotedStamp($quote)]);
            } else {
                $quote->update(['status' => Quote::LOST]);
            }
        }
    }

    /**
     * Jadikan Sales Order. Qty Kg, pcs, dan gramasi ikut terbawa; diskon persen diterjemahkan
     * ke nominal karena baris order menyimpan diskon dalam rupiah.
     *
     * @param  array{customer_id?:int,customer_po?:string,destination?:string,distributor_customer_id?:int}  $data
     */
    public function convertToOrder(Quote $quote, array $data, User $user): SalesOrder
    {
        if ($quote->status === Quote::LOST) {
            throw ValidationException::withMessages(['quote' => ['Quotation sudah ditutup (Lost).']]);
        }
        if (SalesOrder::where('quote_id', $quote->id)->exists()) {
            throw ValidationException::withMessages(['quote' => ['Quotation ini sudah dijadikan order.']]);
        }

        $quote->loadMissing('lines.product');
        if ($quote->lines->isEmpty()) {
            throw ValidationException::withMessages(['quote' => ['Quotation belum punya baris.']]);
        }

        // Poin 18/20: kode produk tiap baris harus sudah teregister (epicor_part_num terisi)
        // sebelum penawaran bisa dijadikan order — mencegah order jalan dengan produk yang masih
        // placeholder sample ("Barangnya ini belum teregister belum?" — hasil meeting Okt 2026).
        $unregistered = $quote->lines->filter(fn (QuoteLine $l) => $l->product && ! $l->product->epicor_part_num);
        if ($unregistered->isNotEmpty()) {
            $hints = $unregistered->map(function (QuoteLine $l) {
                $group = $l->product->product_group ? " (product group: {$l->product->product_group})" : '';

                return "{$l->product->description}{$group}";
            })->unique()->implode(', ');

            throw ValidationException::withMessages([
                'quote' => ["Produk berikut belum teregister, pilih produk pengganti dulu: {$hints}."],
            ]);
        }

        $customerId = $data['customer_id'] ?? $quote->customer_id;
        if (! $customerId) {
            throw ValidationException::withMessages(['customer_id' => ['Pilih customer untuk order ini.']]);
        }

        if (($data['destination'] ?? 'HO') === 'DISTRIBUTOR'
            && (int) ($data['distributor_customer_id'] ?? 0) === (int) $customerId
        ) {
            throw ValidationException::withMessages([
                'distributor_customer_id' => ['Distributor harus berbeda dari customer.'],
            ]);
        }

        $orderLines = $quote->lines->map(fn(QuoteLine $l) => [
            'product_id' => $l->product_id,
            'qty' => $l->qty_pcs,
            'qty_kg' => (float) $l->qty_kg,
            'gramasi_gr' => (float) $l->gramasi_gr,
            'packaging_id' => $l->packaging_id,
            'uom' => 'PCS',
            'unit_price' => (float) $l->unit_price,
            'discount' => round($l->qty_pcs * (float) $l->unit_price * $l->effectivePercent() / 100, 2),
        ])->all();

        return DB::transaction(function () use ($quote, $data, $user, $customerId, $orderLines) {
            $order = $this->orders->create([
                'customer_id' => $customerId,
                'lead_id' => $quote->lead_id,
                'quote_id' => $quote->id,
                'customer_po' => $data['customer_po'] ?? $quote->customer_po,
                'destination' => $data['destination'] ?? 'HO',
                'distributor_customer_id' => ($data['destination'] ?? 'HO') === 'DISTRIBUTOR'
                    ? ($data['distributor_customer_id'] ?? null)
                    : null,
                    'notes' => 'Dari quotation ' . $quote->quote_number,
            ], $orderLines, $user);

            $quote->update([
                'customer_id' => $customerId,
                'status' => Quote::WON,
                ...$this->quotedStamp($quote),
            ]);

            $this->auditLogService->log($user->id, 'quote.convert', Quote::class, $quote->id, null, ['order_id' => $order->id]);

            return $order;
        });
    }

    /** Quoted otomatis (dokumen hal. 32): tanggal Quoted = hari ini dan Expires = +14 hari, bila belum terisi. */
    private function quotedStamp(Quote $quote): array
    {
        return [
            'quoted' => true,
            'quoted_at' => $quote->quoted_at ?? now(),
            'expires_at' => $quote->expires_at ?? now()->addDays(14)->toDateString(),
        ];
    }

    /** Sample yang disetujui (Follow Up "Sample Cocok") untuk prospek Quotation ini, dengan penanda "Already on Line N". */
    public function approvedSamples(Quote $quote): array
    {
        if (! $quote->lead_id) {
            return [];
        }

        $tasks = LeadTask::where('lead_id', $quote->lead_id)
            ->where('conclusion', 'NEXT')
            ->where('reason_code', 'Sample Cocok')
            ->orderBy('id')
            ->get(['id', 'code'])
            ->keyBy('id');
        if ($tasks->isEmpty()) {
            return [];
        }

        $positions = [];
        foreach ($quote->lines()->orderBy('id')->pluck('product_sample_id')->values() as $i => $sampleId) {
            if ($sampleId) {
                $positions[$sampleId] = $i + 1;
            }
        }

        return ProductSample::whereIn('lead_task_id', $tasks->keys())
            ->orderBy('id')
            ->get()
            ->map(function (ProductSample $s) use ($tasks, $positions) {
                preg_match('/^GIVESMPL(\d+)$/', (string) $tasks[$s->lead_task_id]->code, $m);
                $registered = $this->registeredProductFor($s);

                return [
                    'id' => $s->id,
                    'followup_number' => isset($m[1]) ? (int) $m[1] : null,
                    'product_group' => $s->product_group,
                    'part' => $s->part,
                    'rev' => $s->rev,
                    'description' => $s->description,
                    'package_size_gr' => $s->qty,
                    'qty_given' => $s->qty_given,
                    'used_on_line' => $positions[$s->id] ?? null,
                    'registered_product_id' => $registered?->id,
                    'registered_price' => $registered?->price,
                ];
            })
            ->values()
            ->all();
    }

    /** Pencarian produk manual untuk Add Blank Line (Product Group dan teks Part / Description). */
    public function searchProducts(array $filters = []): array
    {
        $products = Product::query()
            ->select(['id', 'part_num', 'description', 'epicor_part_num', 'product_group', 'revision', 'price'])
            ->when(! empty($filters['id']), fn ($q) => $q->where('id', $filters['id']))
            ->when(! empty($filters['registered']), fn ($q) => $q->whereNotNull('epicor_part_num'))
            ->when(! empty($filters['product_group']), fn ($q) => $q->where('product_group', $filters['product_group']))
            ->when(! empty($filters['q']), fn ($q) => $q->where(fn ($w) => $w
                ->where('part_num', 'like', '%'.$filters['q'].'%')
                ->orWhere('description', 'like', '%'.$filters['q'].'%')))
            ->orderBy('product_group')
            ->orderBy('part_num')
            ->limit(30)
            ->get();

        return [
            'groups' => Product::query()->whereNotNull('product_group')->distinct()->orderBy('product_group')->pluck('product_group'),
            'products' => $products,
        ];
    }

    /** Tiap Line yang bertaut ke sample menampilkan "Pulled from Follow Up Sample N" (atribut source_followup). */
    private function attachLineSources(Quote $quote): void
    {
        $ids = $quote->lines->pluck('product_sample_id')->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return;
        }

        $samples = ProductSample::whereIn('id', $ids)->get(['id', 'lead_task_id']);
        $tasks = LeadTask::whereIn('id', $samples->pluck('lead_task_id')->filter())
            ->where('conclusion', 'NEXT')
            ->where('reason_code', 'Sample Cocok')
            ->get(['id', 'code'])
            ->keyBy('id');

        $numbers = [];
        foreach ($samples as $s) {
            $task = $tasks->get($s->lead_task_id);
            if ($task && preg_match('/^GIVESMPL(\d+)$/', (string) $task->code, $m)) {
                $numbers[$s->id] = ['number' => (int) $m[1], 'reason' => 'Sample Cocok'];
            }
        }

        foreach ($quote->lines as $line) {
            $line->setAttribute('source_followup', $numbers[$line->product_sample_id] ?? null);
        }
    }

    /** Produk terdaftar (punya kode Part Epicor) yang cocok dengan Part dan Rev sample; null bila sample itu Custom B2B. */
    private function registeredProductFor(ProductSample $s): ?Product
    {
        if (! $s->part) {
            return null;
        }

        return Product::where('part_num', $s->part)
            ->whereNotNull('epicor_part_num')
            ->when($s->rev, fn ($q) => $q->where('revision', $s->rev))
            ->first();
    }

    /** Produk placeholder untuk sample yang belum punya Part Epicor (Custom B2B); dipakai ulang bila identitasnya sama. */
    private function placeholderProductFor(ProductSample $s): Product
    {
        // Sample dari item Reguler (sudah teregister sebagai Part Epicor): pakai produk itu, bukan placeholder.
        if ($registered = $this->registeredProductFor($s)) {
            return $registered;
        }

        $part = $s->part ?: 'SAMPLE-'.$s->id;

        $existing = Product::where('part_num', $part)
            ->whereNull('epicor_part_num')
            ->when($s->rev, fn ($q) => $q->where('revision', $s->rev), fn ($q) => $q->whereNull('revision'))
            ->first();
        if ($existing) {
            return $existing;
        }

        $base = Product::query()->first();
        if (! $base) {
            throw ValidationException::withMessages(['sample_id' => ['Belum ada produk yang bisa dijadikan dasar produk placeholder sample.']]);
        }

        $product = $base->replicate();
        $product->part_num = $part;
        $product->description = $s->description ?: $part;
        $product->product_group = $s->product_group;
        $product->revision = $s->rev;
        $product->epicor_part_num = null;
        $product->price = 0;
        $product->moq_kg = null;
        $product->save();

        return $product;
    }

    /** Ikat baris Custom B2B ke Part Epicor terdaftar (dokumen hal. 37). Boleh pada Quotation Win; tidak untuk Lost atau yang sudah punya order. */
    public function bindPart(Quote $quote, int $lineId, int $productId): Quote
    {
        if ($quote->status === Quote::LOST) {
            throw ValidationException::withMessages(['quote' => ['Quotation sudah ditutup (Lost).']]);
        }
        if (SalesOrder::where('quote_id', $quote->id)->exists()) {
            throw ValidationException::withMessages(['quote' => ['Quotation ini sudah dijadikan order.']]);
        }

        $line = $quote->lines()->whereKey($lineId)->first();
        if (! $line) {
            throw ValidationException::withMessages(['line' => ['Baris tidak ditemukan.']]);
        }

        $product = Product::whereKey($productId)->whereNotNull('epicor_part_num')->first();
        if (! $product) {
            throw ValidationException::withMessages(['product_id' => ['Pilih Part yang sudah teregister di Epicor.']]);
        }

        $line->update(['product_id' => $product->id]);

        return $quote->load(self::WITH);
    }

    public function nextNumber(): string
    {
        $prefix = 'QT-STG-' . now()->format('Y') . '-';
        $last = Quote::where('quote_number', 'like', $prefix . '%')->orderByDesc('quote_number')->value('quote_number');
        $seq = $last ? ((int) substr($last, -6)) + 1 : 1;

        return $prefix . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
    }

    private function assertOpen(Quote $quote): void
    {
        if ($quote->isClosed()) {
            throw ValidationException::withMessages(['quote' => ['Quotation sudah ditutup (' . $quote->status . ') dan tidak bisa diubah.']]);
        }
    }
}
