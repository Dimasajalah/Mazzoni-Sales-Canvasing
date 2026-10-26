<?php
//backend/app/Services/MarketingSelloutService.php
namespace App\Services;

use App\Models\MarketingEvent;
use App\Models\MarketingSelloutRow;
use App\Models\MarketingSelloutUpload;
use App\Models\User;
use DateTime;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 3.2.7 (MKT07 Upload Data Sell Out). Marketing meng-upload template CSV yang sudah direkap dari data distributor;
 * sistem memvalidasi tiap baris (outlet, salesman, part terdaftar; tanggal dalam periode program). Semua baris valid atau
 * berkas ditolak seluruhnya beserta daftar baris bermasalah. Setelah valid, program siap untuk Pengajuan Klaim (MKT08).
 */
class MarketingSelloutService
{
    /** Template baku (kolom ditetapkan sementara; dokumen tidak merinci isi template). */
    public const COLUMNS = [
        'tanggal' => 'Tanggal transaksi (YYYY-MM-DD atau DD/MM/YYYY)',
        'kode_outlet' => 'Kode outlet (kode customer)',
        'kode_salesman' => 'Kode salesman',
        'kode_part' => 'Kode part',
        'qty' => 'Kuantitas',
        'nilai' => 'Nilai penjualan (Rp)',
    ];

    private const SHOWN_ERRORS = 200;

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    /** Kolom angka yang wajib diisi mengikuti Basis Perhitungan program: Kuantitas atau Nilai Penjualan. */
    public function basisColumn(MarketingEvent $program): string
    {
        return $program->claim_basis === 'QUANTITY' ? 'qty' : 'nilai';
    }

    /** @return array<int, string> */
    public function requiredColumns(MarketingEvent $program): array
    {
        return ['tanggal', 'kode_outlet', 'kode_salesman', 'kode_part', $this->basisColumn($program)];
    }

    public function templateCsv(MarketingEvent $program): array
    {
        return [
            'filename' => 'template-sellout-'.$program->event_code.'.csv',
            'content' => implode(',', array_keys(self::COLUMNS))."\r\n",
        ];
    }

    public function summary(MarketingSelloutUpload $upload, bool $withErrors = false): array
    {
        $data = [
            'id' => $upload->id,
            'filename' => $upload->filename,
            'status' => $upload->status,
            'total_rows' => $upload->total_rows,
            'error_count' => $upload->error_count,
            'total_qty' => (float) $upload->total_qty,
            'total_amount' => (float) $upload->total_amount,
            'uploaded_by' => $upload->uploader->name ?? null,
            'created_at' => optional($upload->created_at)->toIso8601String(),
        ];
        if ($withErrors) {
            $data['errors'] = $upload->errors ?? [];
        }

        return $data;
    }

    /** Keadaan panel Data Sell Out: menyala atau tidak, kolom template, data valid saat ini, dan riwayat berkas. */
    public function panel(MarketingEvent $program): array
    {
        $required = $this->requiredColumns($program);
        $uploads = MarketingSelloutUpload::with('uploader:id,name')->where('marketing_event_id', $program->id)->orderByDesc('id')->limit(10)->get();
        $current = MarketingSelloutUpload::with('uploader:id,name')->where('marketing_event_id', $program->id)->where('status', 'VALID')->orderByDesc('id')->first();

        return [
            'enabled' => $program->claim_source === 'SELL_OUT',
            'claim_basis' => $program->claim_basis,
            'claim_basis_label' => $program->claim_basis_label,
            'period' => ['start' => $program->start_date->format('Y-m-d'), 'end' => $program->end_date->format('Y-m-d')],
            'columns' => collect(self::COLUMNS)->map(fn ($label, $name) => ['name' => $name, 'label' => $label, 'required' => in_array($name, $required, true)])->values()->all(),
            'current' => $current ? $this->summary($current) : null,
            'latest' => $uploads->first() ? $this->summary($uploads->first(), true) : null,
            'history' => $uploads->map(fn ($u) => $this->summary($u))->values()->all(),
            'calculate_ready' => $current !== null,
        ];
    }

    public function ingest(MarketingEvent $program, UploadedFile $file, User $user): MarketingSelloutUpload
    {
        if (! $program->isClaimProgram() || $program->claim_source !== 'SELL_OUT') {
            throw ValidationException::withMessages(['claim_source' => 'Panel Data Sell Out hanya aktif untuk program dengan sumber data Sell Out.']);
        }

        [$rows, $headerError] = $this->readCsv($file, $program);

        $errors = [];
        $valid = [];
        $totalQty = 0.0;
        $totalAmount = 0.0;

        if ($headerError !== null) {
            $errors[] = ['row' => 1, 'field' => 'header', 'value' => '', 'message' => $headerError];
        } else {
            $max = (int) config('marketing.sellout.max_rows', 5000);
            if (count($rows) > $max) {
                throw ValidationException::withMessages(['file' => 'Maksimal '.number_format($max, 0, ',', '.').' baris per berkas.']);
            }

            $outlets = $this->lookup('customers', (array) config('marketing.sellout.outlet_columns'), array_column(array_column($rows, 'cells'), 'kode_outlet'), true);
            $salesmen = $this->lookup('users', (array) config('marketing.sellout.salesman_columns'), array_column(array_column($rows, 'cells'), 'kode_salesman'));
            $parts = $this->lookup('products', (array) config('marketing.sellout.part_columns'), array_column(array_column($rows, 'cells'), 'kode_part'));

            $start = $program->start_date->format('Y-m-d');
            $end = $program->end_date->format('Y-m-d');
            $basis = $this->basisColumn($program);

            foreach ($rows as $row) {
                $n = $row['no'];
                $c = $row['cells'];
                $before = count($errors);
                $err = function (string $field, string $message) use (&$errors, $n, $c) {
                    $errors[] = ['row' => $n, 'field' => $field, 'value' => (string) ($c[$field] ?? ''), 'message' => $message];
                };

                // tanggal harus terbaca dan masuk rentang program
                $date = $c['tanggal'] === '' ? null : $this->parseDate($c['tanggal']);
                if ($c['tanggal'] === '') {
                    $err('tanggal', 'Tanggal wajib diisi.');
                } elseif (! $date) {
                    $err('tanggal', 'Format tanggal tidak dikenali (gunakan YYYY-MM-DD atau DD/MM/YYYY).');
                } elseif ($date->format('Y-m-d') < $start || $date->format('Y-m-d') > $end) {
                    $err('tanggal', 'Tanggal di luar periode program ('.$start.' sampai '.$end.').');
                }

                $outletId = null;
                if ($c['kode_outlet'] === '') {
                    $err('kode_outlet', 'Kode outlet wajib diisi.');
                } elseif (! isset($outlets[mb_strtolower($c['kode_outlet'])])) {
                    $err('kode_outlet', 'Kode outlet tidak terdaftar.');
                } else {
                    $outletId = $outlets[mb_strtolower($c['kode_outlet'])];
                }

                if ($c['kode_salesman'] === '') {
                    $err('kode_salesman', 'Kode salesman wajib diisi.');
                } elseif (! isset($salesmen[mb_strtolower($c['kode_salesman'])])) {
                    $err('kode_salesman', 'Kode salesman tidak terdaftar.');
                }

                if ($c['kode_part'] === '') {
                    $err('kode_part', 'Kode part wajib diisi.');
                } elseif (! isset($parts[mb_strtolower($c['kode_part'])])) {
                    $err('kode_part', 'Kode part tidak ada di Part Master.');
                }

                $numbers = [];
                foreach (['qty', 'nilai'] as $field) {
                    $parsed = $this->number($c[$field] ?? '');
                    if ($parsed === false) {
                        $err($field, 'Angka tidak valid (tulis tanpa pemisah ribuan, mis. 1500000 atau 12.5).');
                    } elseif ($parsed === null && $field === $basis) {
                        $err($field, ($field === 'nilai' ? 'Nilai penjualan' : 'Kuantitas').' wajib diisi (basis perhitungan program).');
                    } elseif ($parsed !== null && $field === $basis && $parsed <= 0) {
                        $err($field, ($field === 'nilai' ? 'Nilai penjualan' : 'Kuantitas').' harus lebih dari 0.');
                    }
                    $numbers[$field] = is_float($parsed) ? $parsed : null;
                }

                if (count($errors) === $before) {
                    $valid[] = [
                        'row_no' => $n, 'sale_date' => $date->format('Y-m-d'), 'customer_id' => $outletId,
                        'customer_code' => $c['kode_outlet'], 'salesperson_code' => $c['kode_salesman'], 'part_num' => $c['kode_part'],
                        'qty' => $numbers['qty'], 'amount' => $numbers['nilai'],
                    ];
                    $totalQty += $numbers['qty'] ?? 0;
                    $totalAmount += $numbers['nilai'] ?? 0;
                }
            }

            if (! $rows) {
                $errors[] = ['row' => 2, 'field' => 'berkas', 'value' => '', 'message' => 'Berkas tidak berisi baris data.'];
            }
        }

        $status = $errors ? 'REJECTED' : 'VALID';

        return DB::transaction(function () use ($program, $file, $user, $rows, $errors, $valid, $status, $totalQty, $totalAmount) {
            $upload = MarketingSelloutUpload::create([
                'marketing_event_id' => $program->id,
                'filename' => $file->getClientOriginalName(),
                'status' => $status,
                'total_rows' => count($rows),
                'error_count' => count($errors),
                'errors' => $errors ? array_slice($errors, 0, self::SHOWN_ERRORS) : null,
                'total_qty' => $status === 'VALID' ? $totalQty : 0,
                'total_amount' => $status === 'VALID' ? $totalAmount : 0,
                'uploaded_by' => $user->id,
            ]);

            if ($status === 'VALID') {
                MarketingSelloutUpload::where('marketing_event_id', $program->id)->where('status', 'VALID')->where('id', '!=', $upload->id)->update(['status' => 'SUPERSEDED']);
                foreach (array_chunk($valid, 500) as $chunk) {
                    MarketingSelloutRow::insert(array_map(fn ($r) => $r + ['upload_id' => $upload->id], $chunk));
                }
            }

            $this->auditLogService->log($user->id, 'marketing_sellout.upload', MarketingEvent::class, $program->id, null, [
                'upload_id' => $upload->id, 'status' => $status, 'rows' => count($rows), 'errors' => count($errors), 'file' => $upload->filename,
            ]);

            return $upload->load('uploader:id,name');
        });
    }

    /**
     * Membaca CSV (pemisah koma, titik koma, atau tab; UTF-8 dengan atau tanpa BOM). Mengembalikan baris data (nomor baris di
     * berkas dan isi sel per nama kolom, tanpa baris kosong) dan pesan galat bila header tidak lengkap.
     *
     * @return array{0: array<int, array{no: int, cells: array<string, string>}>, 1: ?string}
     */
    private function readCsv(UploadedFile $file, MarketingEvent $program): array
    {
        $content = (string) file_get_contents($file->getRealPath());
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content);
        if (! mb_check_encoding($content, 'UTF-8')) {
            $content = mb_convert_encoding($content, 'UTF-8', 'Windows-1252');
        }
        $lines = preg_split('/\r\n|\n|\r/', $content);
        if (! $lines || trim((string) $lines[0]) === '') {
            return [[], 'Berkas kosong atau baris pertama (header) tidak ada.'];
        }

        $delimiter = collect([',', ';', "\t"])->sortByDesc(fn ($d) => substr_count($lines[0], $d))->first();
        $header = array_map(fn ($h) => strtolower(trim((string) preg_replace('/[^a-z0-9]+/i', '_', (string) $h), '_')), str_getcsv($lines[0], $delimiter));

        $missing = array_values(array_diff($this->requiredColumns($program), $header));
        if ($missing) {
            return [[], 'Kolom wajib tidak ada di header: '.implode(', ', $missing).'. Gunakan template yang diunduh dari panel.'];
        }

        $rows = [];
        for ($i = 1, $count = count($lines); $i < $count; $i++) {
            if (trim($lines[$i]) === '') {
                continue;
            }
            $cells = str_getcsv($lines[$i], $delimiter);
            if (! array_filter($cells, fn ($v) => trim((string) $v) !== '')) {
                continue;
            }
            $assoc = [];
            foreach (array_keys(self::COLUMNS) as $name) {
                $pos = array_search($name, $header, true);
                $assoc[$name] = $pos === false ? '' : trim((string) ($cells[$pos] ?? ''));
            }
            $rows[] = ['no' => $i + 1, 'cells' => $assoc];
        }

        return [$rows, null];
    }

    /**
     * Mencocokkan kode dengan master (tanpa membedakan huruf besar-kecil). Mengembalikan peta kode huruf kecil => id (atau true).
     *
     * @param array<int, string> $columns
     * @param array<int, string> $codes
     * @return array<string, int|bool>
     */
    private function lookup(string $table, array $columns, array $codes, bool $withId = false): array
    {
        $codes = array_values(array_unique(array_filter(array_map(fn ($c) => mb_strtolower(trim((string) $c)), $codes), fn ($c) => $c !== '')));
        $found = [];
        if (! $codes) {
            return $found;
        }

        foreach ($columns as $col) {
            if (! preg_match('/^[a-z_]+$/', (string) $col) || ! Schema::hasColumn($table, $col)) {
                continue;
            }
            foreach (array_chunk($codes, 500) as $chunk) {
                $query = DB::table($table)->whereRaw('LOWER('.$col.') IN ('.implode(',', array_fill(0, count($chunk), '?')).')', $chunk);
                foreach ($query->get($withId ? ['id', $col] : [$col]) as $row) {
                    $key = mb_strtolower(trim((string) $row->{$col}));
                    $found[$key] = $found[$key] ?? ($withId ? (int) $row->id : true);
                }
            }
        }

        return $found;
    }

    private function parseDate(string $value): ?DateTime
    {
        foreach (['Y-m-d', 'j/n/Y', 'j-n-Y', 'Y/m/d'] as $format) {
            $date = DateTime::createFromFormat('!'.$format, $value);
            $problems = DateTime::getLastErrors();
            if ($date && (! $problems || ($problems['warning_count'] === 0 && $problems['error_count'] === 0))) {
                return $date;
            }
        }

        return null;
    }

    /** @return float|false|null null = kosong, false = tidak valid */
    private function number(string $value): float|false|null
    {
        if ($value === '') {
            return null;
        }
        if (! preg_match('/^\d+([.,]\d+)?$/', $value)) {
            return false;
        }

        return (float) str_replace(',', '.', $value);
    }
}