<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseStatusHistory;
use App\Models\Inventory;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\LeadFollowup;
use App\Models\Notification;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Promotion;
use App\Models\ReturnRequest;
use App\Models\ReturnRequestLine;
use App\Models\ReturnStatusHistory;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use App\Models\Shipment;
use App\Models\ShipmentLine;
use App\Models\Territory;
use App\Models\User;
use App\Models\Visit;
use App\Models\VisitActivity;
use Carbon\Carbon;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        if (app()->environment('production')) {
            $this->command?->warn('Seeding skipped: APP_ENV is production.');

            return;
        }

        DB::transaction(function () {
            $users = $this->seedUsers();
            $budi = $users['budi'];
            $this->seedTerritory();
            $customers = $this->seedCustomers($budi);
            $products = $this->seedProducts();
            $this->seedInventories($products);
            $this->seedLeads($budi);
            $promos = $this->seedPromotions();
            $orders = $this->seedSalesOrders($budi, $customers, $products, $promos);
            $this->seedShipments($orders);
            $this->seedInvoicesAndPayments($budi, $orders, $products);
            $this->seedVisits($budi, $customers);
            $this->seedExpenses($budi, $customers);
            $this->seedReturns($budi, $customers, $products, $orders);
            $this->seedNotifications($budi);
        });

        $this->command?->info('Prototype seed completed.');
        $this->command?->table(
            ['Entity', 'Count'],
            [
                ['users', User::count()],
                ['territories', Territory::count()],
                ['customers', Customer::count()],
                ['products', Product::count()],
                ['inventories', Inventory::count()],
                ['leads', Lead::count()],
                ['promotions', Promotion::count()],
                ['sales_orders', SalesOrder::count()],
                ['sales_order_lines', SalesOrderLine::count()],
                ['shipments', Shipment::count()],
                ['shipment_lines', ShipmentLine::count()],
                ['invoices', Invoice::count()],
                ['payments', Payment::count()],
                ['visits', Visit::count()],
                ['expenses', Expense::count()],
                ['return_requests', ReturnRequest::count()],
                ['notifications', DB::table('notifications')->count()],
            ]
        );
    }

    private function seedUsers(): array
    {
        $defs = [
            'admin' => [
                'username' => 'admin',
                'email' => 'admin@mazzoni.local',
                'name' => 'Administrator',
                'role' => 'admin',
                'territory' => 'All',
                'employee_id' => 'EMP-ADM',
                'salesperson_code' => null,
            ],
            'budi' => [
                'username' => 'budi.santoso',
                'email' => 'budi.santoso@mazzoni.local',
                'name' => 'Budi Santoso',
                'role' => 'sales',
                'territory' => 'Surabaya',
                'employee_id' => 'EMP-001',
                'salesperson_code' => 'SLS-001',
            ],
            'supervisor' => [
                'username' => 'supervisor',
                'email' => 'supervisor@mazzoni.local',
                'name' => 'Supervisor Area',
                'role' => 'supervisor',
                'territory' => 'Surabaya',
                'employee_id' => 'EMP-SUP',
                'salesperson_code' => null,
            ],
            'finance' => [
                'username' => 'finance',
                'email' => 'finance@mazzoni.local',
                'name' => 'Finance User',
                'role' => 'finance',
                'territory' => 'All',
                'employee_id' => 'EMP-FIN',
                'salesperson_code' => null,
            ],
            'warehouse' => [
                'username' => 'warehouse',
                'email' => 'warehouse@mazzoni.local',
                'name' => 'Warehouse User',
                'role' => 'warehouse',
                'territory' => 'Surabaya',
                'employee_id' => 'EMP-WH',
                'salesperson_code' => null,
            ],
        ];

        $users = [];
        foreach ($defs as $key => $data) {
            $users[$key] = User::create([
                ...$data,
                'password' => 'password',
                'active' => true,
                'email_verified_at' => now(),
            ]);
        }

        return $users;
    }

    private function seedTerritory(): Territory
    {
        return Territory::create([
            'code' => 'SBY',
            'name' => 'Surabaya',
        ]);
    }

    private function seedCustomers(User $budi): array
    {
        $rows = [
            ['C-10531', 'PT Global Sukses', 'Distributor', 'A', 'Jl. Margomulyo, Surabaya', '031-55510531', 600000000, -7.2890000, 112.7460000],
            ['C-10502', 'PT Sinar Terang', 'Distributor', 'A', 'Jl. Rungkut Asri, Surabaya', '031-55510502', 400000000, -7.2701000, 112.7502000],
            ['C-10495', 'UD Abadi Jaya', 'Grosir', 'B', 'Jl. Kalimas, Surabaya', '031-55510495', 300000000, -7.2510000, 112.7300000],
            ['C-10482', 'PT Cahaya Abadi', 'Distributor', 'A', 'Jl. Rungkut Industri III/22, Surabaya', '031-55510482', 500000000, -7.2575000, 112.7521000],
            ['C-10520', 'PT Mega Buana', 'Distributor', 'B', 'Jl. Jemursari, Surabaya', '031-55510520', 400000000, -7.3100000, 112.7700000],
            ['C-10476', 'PT Karya Lestari', 'Manufaktur', 'B', 'Jl. Mastrip, Surabaya', '031-55510476', 300000000, -7.3350000, 112.7300000],
            ['C-10466', 'UD Sumber Makmur', 'Grosir', 'C', 'Jl. Gresik, Surabaya', '031-55510466', 200000000, -7.2400000, 112.7350000],
            ['C-10488', 'UD Sentosa Jaya', 'Grosir', 'B', 'Jl. Kembang Jepun, Surabaya', '031-55510488', 250000000, -7.2456000, 112.7378000],
            ['C-10540', 'PT Harapan Prima', 'Retail', 'B', 'Jl. Kertajaya, Surabaya', '031-55510540', 200000000, -7.2800000, 112.7900000],
            ['C-10512', 'Toko Rejeki Makmur', 'Retail', 'C', 'Jl. Wonokromo, Surabaya', '031-55510512', 150000000, -7.3000000, 112.7400000],
            ['C-10510', 'CV Makmur Jaya', 'Retail', 'B', 'Jl. Raya Menganti, Surabaya', '031-55510510', 150000000, -7.3305000, 112.7876000],
            ['C-10508', 'Toko Berkah', 'Retail', 'C', 'Jl. Ngagel, Surabaya', '031-55510508', 100000000, -7.2600000, 112.7600000],
        ];

        $hasAvatarColor = Schema::hasColumn('customers', 'avatar_color');
        $customers = [];

        foreach ($rows as [$code, $name, $group, $grade, $address, $phone, $limit, $lat, $lng]) {
            $payload = [
                'customer_code' => $code,
                'name' => $name,
                'customer_group' => $group,
                'grade' => $grade,
                'address' => $address,
                'city' => 'Surabaya',
                'phone' => $phone,
                'email' => Str::slug($name, '.').'@customer.local',
                'npwp' => '10.'.substr(preg_replace('/\D/', '', $code), -3).'.'.random_int(100, 999).'.0-601.000',
                'credit_limit' => $limit,
                'latitude' => $lat,
                'longitude' => $lng,
                'salesperson_id' => $budi->id,
                'active' => true,
                'sync_status' => 'NOT_REQUIRED',
            ];

            if ($hasAvatarColor) {
                $payload['avatar_color'] = collect(['#2a6fd6', '#ee6a0a', '#12a05a', '#dc3055', '#b87400'])->random();
            }

            $customers[] = Customer::create($payload);
        }

        return $customers;
    }

    private function seedProducts(): array
    {
        // Master produk sesuai Prototype_Sales_Canvassing_BMT.html (stock[])
        $items = [
            ['STM-1000', 'Saus Tomat 1kg', 28500],
            ['SSB-1000', 'Saus Sambal 1kg', 31000],
            ['MYO-1000', 'Mayonnaise 1kg', 46500],
            ['KCM-0600', 'Kecap Manis 600ml', 22000],
            ['STM-0340', 'Saus Tomat 340g', 11500],
            ['SSX-0340', 'Saus Sambal Extra Hot 340g', 12800],
            ['MYP-0500', 'Mayonnaise Pedas 500g', 26900],
            ['BBQ-1000', 'Saus BBQ 1kg', 38500],
            ['BNG-1000', 'Bumbu Nasi Goreng 1kg', 34000],
            ['SKJ-1000', 'Saus Keju 1kg', 52000],
            ['CHO-0250', 'Chili Oil 250ml', 24500],
            ['KCA-0600', 'Kecap Asin 600ml', 19500],
        ];

        $products = [];
        foreach ($items as [$part, $desc, $price]) {
            $products[] = Product::create([
                'part_num' => $part,
                'description' => $desc,
                'uom' => 'DUS',
                'price' => $price,
                'active' => true,
                'sync_status' => 'NOT_REQUIRED',
            ]);
        }

        return $products;
    }

    private function seedInventories(array $products): void
    {
        // Qty & bin Gudang SBY mengikuti prototype stock[]
        $sbyStock = [
            'STM-1000' => ['bin' => 'A-01', 'on_hand' => 340],
            'SSB-1000' => ['bin' => 'A-02', 'on_hand' => 288],
            'MYO-1000' => ['bin' => 'C-02', 'on_hand' => 12],
            'KCM-0600' => ['bin' => 'B-01', 'on_hand' => 410],
            'STM-0340' => ['bin' => 'A-03', 'on_hand' => 0],
            'SSX-0340' => ['bin' => 'B-03', 'on_hand' => 156],
            'MYP-0500' => ['bin' => 'C-04', 'on_hand' => 88],
            'BBQ-1000' => ['bin' => 'C-01', 'on_hand' => 64],
            'BNG-1000' => ['bin' => 'C-03', 'on_hand' => 24],
            'SKJ-1000' => ['bin' => 'D-02', 'on_hand' => 132],
            'CHO-0250' => ['bin' => 'D-05', 'on_hand' => 96],
            'KCA-0600' => ['bin' => 'B-02', 'on_hand' => 178],
        ];

        foreach ($products as $i => $product) {
            $cfg = $sbyStock[$product->part_num] ?? ['bin' => 'Z-01', 'on_hand' => 50];
            $onHand = $cfg['on_hand'];
            $allocated = 0;

            Inventory::create([
                'product_id' => $product->id,
                'warehouse' => 'Gudang SBY',
                'bin' => $cfg['bin'],
                'on_hand_qty' => $onHand,
                'allocated_qty' => $allocated,
                'available_qty' => max(0, $onHand - $allocated),
            ]);

            // Sebagian produk punya stok cadangan JKT (bukan yang habis)
            if ($onHand > 0 && $i % 3 === 0) {
                Inventory::create([
                    'product_id' => $product->id,
                    'warehouse' => 'Gudang JKT',
                    'bin' => 'J-0'.(($i % 3) + 1),
                    'on_hand_qty' => 40,
                    'allocated_qty' => 0,
                    'available_qty' => 40,
                ]);
            }
        }
    }

    private function seedLeads(User $budi): void
    {
        $leads = [
            ['CV Prima Rasa', 'Andi Wijaya', 'NEW', 25000000],
            ['Toko Segar Abadi', 'Siti Aminah', 'NEW', 12000000],
            ['UD Mitra Sejahtera', 'Hendra Gunawan', 'CONTACTED', 45000000],
            ['PT Nusantara Food', 'Rina Kartika', 'CONTACTED', 80000000],
            ['Warung Makmur', 'Agus Salim', 'QUALIFIED', 18000000],
            ['CV Berkah Pangan', 'Dewi Lestari', 'QUALIFIED', 55000000],
            ['PT Indo Sauce', 'Bambang Sutrisno', 'QUOTE', 120000000],
            ['Distributor Timur', 'Yudi Pratama', 'QUOTE', 95000000],
            ['CV Harmoni Rasa', 'Lina Marlina', 'WON', 70000000],
            ['Toko Panen Raya', 'Eko Prasetyo', 'WON', 22000000],
            ['UD Cipta Rasa', 'Maya Sari', 'LOST', 30000000],
            ['PT Selera Nusantara', 'Fajar Nugroho', 'LOST', 150000000],
            ['CV Ocean Flavor', 'Putri Ananda', 'NEW', 40000000],
            ['Grosir Saus Jaya', 'Rudi Hartono', 'CONTACTED', 60000000],
            ['PT Multirasa', 'Nina Kusuma', 'QUALIFIED', 88000000],
        ];

        foreach ($leads as $idx => [$biz, $owner, $stage, $value]) {
            $lead = Lead::create([
                'business_name' => $biz,
                'owner_name' => $owner,
                'address' => 'Jl. Prototipe '.($idx + 1).', Surabaya',
                'phone' => '0812'.str_pad((string) (3000000 + $idx), 7, '0', STR_PAD_LEFT),
                'email' => Str::slug($biz, '.').'@lead.local',
                'business_type' => ['Distributor Retail', 'Grosir', 'Manufaktur', 'HORECA'][$idx % 4],
                'latitude' => -7.2500 + ($idx * 0.003),
                'longitude' => 112.7500 + ($idx * 0.002),
                'salesperson_id' => $budi->id,
                'stage' => $stage,
                'estimated_value' => $value,
                'register_date' => Carbon::create(2026, 1, 5)->addDays($idx * 3),
                'client_uuid' => (string) Str::uuid(),
            ]);

            LeadActivity::create([
                'lead_id' => $lead->id,
                'user_id' => $budi->id,
                'activity_type' => 'STAGE_CHANGE',
                'notes' => "Lead masuk tahap {$stage}",
                'from_stage' => 'NEW',
                'to_stage' => $stage,
            ]);

            if (in_array($stage, ['CONTACTED', 'QUALIFIED', 'QUOTE'], true)) {
                LeadFollowup::create([
                    'lead_id' => $lead->id,
                    'salesperson_id' => $budi->id,
                    'followup_at' => now()->addDays(($idx % 5) + 1),
                    'notes' => 'Follow-up prototype seed',
                    'status' => 'PENDING',
                ]);
            }
        }
    }

    private function seedPromotions(): array
    {
        $promos = [
            ['PROMO-NY12', 'Diskon 12% Akhir Tahun', 'discount', 12.0, null, 10, 5000000, null],
            ['PROMO-BND1', 'Bundle Hemat A + C', 'bundle', null, null, 10, null, 'Distributor'],
            ['PROMO-CB5', 'Cashback 5% Bayar Cepat', 'cashback', 5.0, null, null, 3000000, null],
            ['PROMO-ONG', 'Gratis Ongkir Zona SBY', 'discount', null, 75000, 5, 1500000, 'Retail'],
            ['PROMO-VOL3', 'Rebate Volume Kuartal', 'cashback', 3.0, null, 20, 10000000, 'Distributor'],
            ['PROMO-HOT1', 'Promo Sambal Hot', 'discount', 8.0, null, 8, 1000000, 'Grosir'],
            ['PROMO-MYO2', 'Mayonnaise Twin Pack', 'bundle', null, 25000, 2, 500000, null],
            ['PROMO-Q1A', 'Q1 Acceleration', 'discount', 10.0, null, 15, 2500000, null],
            ['PROMO-RET5', 'Retail Weekend 5%', 'discount', 5.0, null, 5, 500000, 'Retail'],
            ['PROMO-NEW10', 'New Outlet Welcome', 'discount', 10.0, null, 5, 750000, null],
        ];

        $out = [];
        foreach ($promos as $i => [$code, $name, $type, $pct, $amt, $minQty, $minAmt, $group]) {
            $out[] = Promotion::create([
                'promo_code' => $code,
                'name' => $name,
                'description' => "{$name} — berlaku staging demo 2026",
                'promo_type' => $type,
                'start_date' => Carbon::create(2026, 1, 1)->addMonths($i % 3),
                'end_date' => Carbon::create(2026, 12, 31),
                'minimum_qty' => $minQty,
                'minimum_amount' => $minAmt,
                'discount_percent' => $pct,
                'discount_amount' => $amt,
                'customer_group' => $group,
                'active' => true,
            ]);
        }

        return $out;
    }

    private function seedSalesOrders(User $budi, array $customers, array $products, array $promos): array
    {
        $statuses = [
            'DRAFT', 'SUBMITTED', 'CONFIRMED', 'PICKING', 'SHIPPED', 'DELIVERED',
            'INVOICED', 'CLOSED', 'CANCELLED', 'CONFIRMED', 'SHIPPED', 'DELIVERED',
            'INVOICED', 'SUBMITTED', 'PICKING', 'DELIVERED', 'CONFIRMED', 'SHIPPED',
            'INVOICED', 'CLOSED',
        ];

        $orders = [];
        for ($n = 1; $n <= 20; $n++) {
            $customer = $customers[($n - 1) % count($customers)];
            $p1 = $products[($n - 1) % count($products)];
            $p2 = $products[$n % count($products)];
            $qty1 = 5 + ($n % 10);
            $qty2 = 3 + ($n % 7);
            $line1 = $qty1 * (float) $p1->price;
            $line2 = $qty2 * (float) $p2->price;
            $sub = $line1 + $line2;
            $disc = $n % 4 === 0 ? 50000 : 0;
            $promo = $n % 3 === 0 ? $promos[$n % count($promos)] : null;

            $order = SalesOrder::create([
                'order_number' => sprintf('SO-STG-2026-%06d', $n),
                'customer_id' => $customer->id,
                'customer_po' => 'PO-MZ-'.(1000 + $n),
                'salesperson_id' => $budi->id,
                'order_date' => Carbon::create(2026, 1, 2)->addDays($n * 2),
                'subtotal' => $sub,
                'discount' => $disc,
                'total' => max(0, $sub - $disc),
                'status' => $statuses[$n - 1],
                'sync_status' => 'NOT_REQUIRED',
                'client_uuid' => (string) Str::uuid(),
                'promo_id' => $promo?->id,
                'notes' => 'Order prototype seed #'.$n,
            ]);

            SalesOrderLine::create([
                'order_id' => $order->id,
                'product_id' => $p1->id,
                'qty' => $qty1,
                'uom' => 'DUS',
                'unit_price' => $p1->price,
                'discount' => 0,
                'line_total' => $line1,
            ]);
            SalesOrderLine::create([
                'order_id' => $order->id,
                'product_id' => $p2->id,
                'qty' => $qty2,
                'uom' => 'DUS',
                'unit_price' => $p2->price,
                'discount' => 0,
                'line_total' => $line2,
            ]);

            $orders[] = $order->load('lines');
        }

        return $orders;
    }

    private function seedShipments(array $orders): void
    {
        $shipStatuses = ['PENDING', 'PICKED', 'IN_TRANSIT', 'DELIVERED'];
        $eligible = array_values(array_filter(
            $orders,
            fn (SalesOrder $o) => in_array($o->status, ['PICKING', 'SHIPPED', 'DELIVERED', 'INVOICED', 'CLOSED'], true)
        ));

        foreach (array_slice($eligible, 0, 10) as $i => $order) {
            $shipment = Shipment::create([
                'shipment_number' => sprintf('SHP-STG-2026-%06d', $i + 1),
                'sales_order_id' => $order->id,
                'ship_date' => Carbon::parse($order->order_date)->addDays(2),
                'status' => $shipStatuses[$i % count($shipStatuses)],
                'epicor_pack_num' => 'PS-'.(1100 + $i),
                'notes' => 'Shipment prototype untuk '.$order->order_number,
            ]);

            foreach ($order->lines->take(2) as $line) {
                ShipmentLine::create([
                    'shipment_id' => $shipment->id,
                    'product_id' => $line->product_id,
                    'qty' => max(1, (float) $line->qty - 1),
                    'uom' => 'DUS',
                ]);
            }
        }
    }

    private function seedInvoicesAndPayments(User $budi, array $orders, array $products): void
    {
        $today = Carbon::today();
        $agingPlans = [
            ['due' => $today->copy()->addDays(10), 'paid_ratio' => 0.0, 'status' => 'OPEN'],
            ['due' => $today->copy()->addDays(5), 'paid_ratio' => 0.3, 'status' => 'PARTIAL'],
            ['due' => $today->copy()->subDays(15), 'paid_ratio' => 0.0, 'status' => 'OPEN'],
            ['due' => $today->copy()->subDays(25), 'paid_ratio' => 0.4, 'status' => 'PARTIAL'],
            ['due' => $today->copy()->subDays(40), 'paid_ratio' => 0.0, 'status' => 'OPEN'],
            ['due' => $today->copy()->subDays(50), 'paid_ratio' => 0.2, 'status' => 'PARTIAL'],
            ['due' => $today->copy()->subDays(75), 'paid_ratio' => 0.0, 'status' => 'OPEN'],
            ['due' => $today->copy()->subDays(90), 'paid_ratio' => 0.5, 'status' => 'PARTIAL'],
            ['due' => $today->copy()->subDays(5), 'paid_ratio' => 1.0, 'status' => 'PAID'],
            ['due' => $today->copy()->addDays(20), 'paid_ratio' => 0.0, 'status' => 'OPEN'],
            ['due' => $today->copy()->subDays(35), 'paid_ratio' => 0.0, 'status' => 'OPEN'],
            ['due' => $today->copy()->subDays(65), 'paid_ratio' => 0.25, 'status' => 'PARTIAL'],
        ];

        $invoiceOrders = array_values(array_filter(
            $orders,
            fn (SalesOrder $o) => in_array($o->status, ['DELIVERED', 'INVOICED', 'CLOSED', 'SHIPPED'], true)
        ));
        if ($invoiceOrders === []) {
            $invoiceOrders = $orders;
        }

        $productById = collect($products)->keyBy('id');

        foreach ($agingPlans as $i => $plan) {
            $order = $invoiceOrders[$i % count($invoiceOrders)];
            $amount = (float) $order->total;
            $paid = round($amount * $plan['paid_ratio'], 2);
            $balance = round($amount - $paid, 2);
            $invoiceDate = Carbon::parse($plan['due'])->copy()->subDays(30);

            $invoice = Invoice::create([
                'invoice_number' => sprintf('INV-STG-2026-%06d', $i + 1),
                'customer_id' => $order->customer_id,
                'sales_order_id' => $order->id,
                'invoice_date' => $invoiceDate,
                'due_date' => $plan['due'],
                'invoice_amount' => $amount,
                'paid_amount' => $paid,
                'balance' => $balance,
                'status' => $plan['status'],
                'sync_status' => 'NOT_REQUIRED',
            ]);

            foreach ($order->lines->take(2) as $line) {
                $desc = $productById->get($line->product_id)?->description ?? 'Item';
                InvoiceLine::create([
                    'invoice_id' => $invoice->id,
                    'product_id' => $line->product_id,
                    'description' => $desc,
                    'qty' => $line->qty,
                    'uom' => 'DUS',
                    'unit_price' => $line->unit_price,
                    'line_total' => $line->line_total,
                ]);
            }

            if ($paid > 0) {
                Payment::create([
                    'customer_id' => $invoice->customer_id,
                    'invoice_id' => $invoice->id,
                    'amount' => $paid,
                    'method' => ['TRANSFER', 'CASH', 'GIRO'][$i % 3],
                    'reference' => sprintf('PAY-STG-%06d', $i + 1),
                    'payment_date' => $invoiceDate->copy()->addDays(10),
                    'salesperson_id' => $budi->id,
                    'notes' => 'Pembayaran prototype seed',
                ]);
            }
        }
    }

    private function seedVisits(User $budi, array $customers): void
    {
        $results = ['ORDERED', 'PROMO_OFFERED', 'FOLLOW_UP', 'NO_ORDER', 'COLLECTED'];

        for ($i = 0; $i < 8; $i++) {
            $customer = $customers[$i % count($customers)];
            $checkin = Carbon::today()->subDays(8 - $i)->setTime(9 + ($i % 5), 15);
            $checkout = $checkin->copy()->addMinutes(35 + ($i * 5));

            $visit = Visit::create([
                'customer_id' => $customer->id,
                'salesperson_id' => $budi->id,
                'checkin_at' => $checkin,
                'checkin_latitude' => $customer->latitude,
                'checkin_longitude' => $customer->longitude,
                'checkin_accuracy' => 12.5,
                'checkin_distance' => 45 + ($i * 8),
                'checkout_at' => $checkout,
                'checkout_latitude' => $customer->latitude,
                'checkout_longitude' => $customer->longitude,
                'duration_minutes' => (int) $checkin->diffInMinutes($checkout),
                'visit_result' => $results[$i % count($results)],
                'notes' => 'Kunjungan selesai — prototype seed',
            ]);

            VisitActivity::create([
                'visit_id' => $visit->id,
                'user_id' => $budi->id,
                'activity_type' => 'CHECKIN',
                'notes' => 'Check-in berhasil',
            ]);
            VisitActivity::create([
                'visit_id' => $visit->id,
                'user_id' => $budi->id,
                'activity_type' => 'CHECKOUT',
                'notes' => 'Check-out selesai',
            ]);
        }
    }

    private function seedExpenses(User $budi, array $customers): void
    {
        $rows = [
            ['EXP-STG-2026-000001', 'BBM', 185000, 'SUBMITTED'],
            ['EXP-STG-2026-000002', 'PARKIR', 25000, 'APPROVED'],
            ['EXP-STG-2026-000003', 'MAKAN', 75000, 'REJECTED'],
            ['EXP-STG-2026-000004', 'TOL', 45000, 'PAID'],
            ['EXP-STG-2026-000005', 'BBM', 210000, 'APPROVED'],
            ['EXP-STG-2026-000006', 'LAINNYA', 50000, 'SUBMITTED'],
        ];

        foreach ($rows as $i => [$num, $cat, $amount, $status]) {
            $expense = Expense::create([
                'expense_number' => $num,
                'salesperson_id' => $budi->id,
                'customer_id' => $i % 2 === 0 ? $customers[$i % count($customers)]->id : null,
                'category' => $cat,
                'amount' => $amount,
                'note' => "Biaya {$cat} — prototype",
                'expense_date' => Carbon::today()->subDays($i + 1),
                'status' => $status,
                'client_uuid' => (string) Str::uuid(),
            ]);

            ExpenseStatusHistory::create([
                'expense_id' => $expense->id,
                'user_id' => $budi->id,
                'from_status' => 'DRAFT',
                'to_status' => $status,
                'notes' => 'Status awal dari seed',
            ]);
        }
    }

    private function seedReturns(User $budi, array $customers, array $products, array $orders): void
    {
        $defs = [
            ['RET-STG-2026-000001', 'RMA_ISSUED', 'RMA-STG-2026-000001', 'Kemasan rusak saat pengiriman'],
            ['RET-STG-2026-000002', 'SUBMITTED', null, 'Salah kirim varian'],
            ['RET-STG-2026-000003', 'VERIFIED', null, 'Kadaluarsa dekat'],
            ['RET-STG-2026-000004', 'REJECTED', null, 'Tidak sesuai syarat retur'],
        ];

        foreach ($defs as $i => [$num, $status, $rma, $reason]) {
            $order = $orders[$i] ?? $orders[0];
            $ret = ReturnRequest::create([
                'return_number' => $num,
                'customer_id' => $customers[$i % count($customers)]->id,
                'salesperson_id' => $budi->id,
                'so_reference' => $order->order_number,
                'reason' => $reason,
                'condition_notes' => 'Kondisi dicatat saat kunjungan',
                'status' => $status,
                'rma_number' => $rma,
                'client_uuid' => (string) Str::uuid(),
            ]);

            ReturnRequestLine::create([
                'return_request_id' => $ret->id,
                'product_id' => $products[$i % count($products)]->id,
                'qty' => ($i + 1) * 2,
            ]);

            if ($i % 2 === 1) {
                ReturnRequestLine::create([
                    'return_request_id' => $ret->id,
                    'product_id' => $products[($i + 5) % count($products)]->id,
                    'qty' => 1,
                ]);
            }

            ReturnStatusHistory::create([
                'return_request_id' => $ret->id,
                'user_id' => $budi->id,
                'from_status' => 'SUBMITTED',
                'to_status' => $status,
                'notes' => 'Seed status history',
            ]);
        }
    }

    private function seedNotifications(User $budi): void
    {
        $items = [
            ['Order dikonfirmasi', 'SO-STG-2026-000003 telah dikonfirmasi gudang.', 'ORDER', false],
            ['Invoice jatuh tempo', 'Ada invoice masuk bucket 1-30 hari.', 'AR', false],
            ['Expense disetujui', 'EXP-STG-2026-000002 telah APPROVED.', 'EXPENSE', true],
            ['RMA diterbitkan', 'RMA-STG-2026-000001 siap diproses.', 'RETURN', false],
            ['Lead follow-up', 'Jangan lupa follow-up lead CV Prima Rasa.', 'LEAD', false],
        ];

        foreach ($items as [$title, $body, $type, $read]) {
            Notification::create([
                'user_id' => $budi->id,
                'title' => $title,
                'body' => $body,
                'type' => $type,
                'data' => ['source' => 'seed'],
                'read_at' => $read ? now()->subHour() : null,
            ]);
        }
    }
}
