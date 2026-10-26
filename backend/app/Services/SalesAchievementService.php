<?php

namespace App\Services;

use App\Models\SalesAchievementRow;
use App\Models\SalesAchievementUpload;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Blueprint MJU 5.2.14 (SL14 Achievement Sales). Sales Target dan Achievement dihitung manual di luar sistem oleh
 * Marketing/Admin, lalu diupload ke sini sebagai sumber dua dashboard di Home: Dashboard Last Achievement (capaian
 * periode sebelumnya, pembanding) dan Dashboard Actual Achievement (capaian periode berjalan terhadap target).
 * Aplikasi hanya menyimpan dan menampilkan angkanya; tidak ada perhitungan capaian di sistem.
 */
class SalesAchievementService
{
    public const COLUMNS = [
        'periode' => 'Periode (YYYY-MM)',
        'kode_sales' => 'Kode sales (salesperson_code)',
        'target' => 'Sales Target (Rp)',
        'actual' => 'Achievement / capaian aktual (Rp)',
    ];

    private const SHOWN_ERRORS = 200;

    public function __construct(private readonly AuditLogService $auditLogService)
    {
    }

    public function requiredColumns(): array
    {
        return array_keys(self::COLUMNS);
    }

    public function templateCsv(): array
    {
        return [
            'filename' => 'template-sales-achievement.csv',
            'content' => implode(',', array_keys(self::COLUMNS))."\r\n",
        ];
    }

    public function summary(SalesAchievementUpload $upload, bool $withErrors = false): array
    {
        $data = [
            'id' => $upload->id,
            'filename' => $upload->filename,
            'status' => $upload->status,
            'total_rows' => $upload->total_rows,
            'error_count' => $upload->error_count,
            'uploaded_by' => $upload->uploader->name ?? null,
            'created_at' => optional($upload->created_at)->toIso8601String(),
        ];
        if ($withErrors) {
            $data['errors'] = $upload->errors ?? [];
        }

        return $data;
    }

    /** Keadaan panel upload: kolom template, berkas terbaru, dan riwayat. */
    public function panel(): array
    {
        $uploads = SalesAchievementUpload::with('uploader:id,name')->orderByDesc('id')->limit(10)->get();

        return [
            'columns' => collect(self::COLUMNS)->map(fn ($label, $name) => ['name' => $name, 'label' => $label, 'required' => true])->values()->all(),
            'latest' => $uploads->first() ? $this->summary($uploads->first(), true) : null,
            'history' => $uploads->map(fn ($u) => $this->summary($u))->values()->all(),
        ];
    }

    public function ingest(UploadedFile $file, User $user): SalesAchievementUpload
    {
        [$rows, $headerError] = $this->readCsv($file);

        $errors = [];
        $valid = [];

        if ($headerError !== null) {
            $errors[] = ['row' => 1, 'field' => 'header', 'value' => '', 'message' => $headerError];
        } else {
            $max = (int) config('marketing.achievement.max_rows', 5000);
            if (count($rows) > $max) {
                throw ValidationException::withMessages(['file' => 'Maksimal '.number_format($max, 0, ',', '.').' baris per berkas.']);
            }

            $salesmen = $this->lookupSalesmen(array_column(array_column($rows, 'cells'), 'kode_sales'));

            foreach ($rows as $row) {
                $n = $row['no'];
                $c = $row['cells'];
                $before = count($errors);
                $err = function (string $field, string $message) use (&$errors, $n, $c) {
                    $errors[] = ['row' => $n, 'field' => $field, 'value' => (string) ($c[$field] ?? ''), 'message' => $message];
                };

                $period = null;
                if ($c['periode'] === '') {
                    $err('periode', 'Periode wajib diisi.');
                } elseif (! preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $c['periode'])) {
                    $err('periode', 'Format periode harus YYYY-MM, mis. 2026-10.');
                } else {
                    $period = $c['periode'];
                }

                $salespersonId = null;
                if ($c['kode_sales'] === '') {
                    $err('kode_sales', 'Kode sales wajib diisi.');
                } elseif (! isset($salesmen[mb_strtolower($c['kode_sales'])])) {
                    $err('kode_sales', 'Kode sales tidak terdaftar.');
                } else {
                    $salespersonId = $salesmen[mb_strtolower($c['kode_sales'])];
                }

                $numbers = [];
                foreach (['target', 'actual'] as $field) {
                    $parsed = $this->number($c[$field] ?? '');
                    if ($parsed === false) {
                        $err($field, 'Angka tidak valid (tulis tanpa pemisah ribuan, mis. 15000000 atau 12.5).');
                    } elseif ($parsed === null) {
                        $err($field, ($field === 'target' ? 'Sales Target' : 'Achievement').' wajib diisi (boleh 0).');
                    } elseif ($parsed < 0) {
                        $err($field, ($field === 'target' ? 'Sales Target' : 'Achievement').' tidak boleh negatif.');
                    }
                    $numbers[$field] = is_float($parsed) ? $parsed : 0.0;
                }

                if (count($errors) === $before) {
                    $valid[] = [
                        'period' => $period, 'salesperson_id' => $salespersonId, 'salesperson_code' => $c['kode_sales'],
                        'target' => $numbers['target'], 'actual' => $numbers['actual'],
                    ];
                }
            }

            if (! $rows) {
                $errors[] = ['row' => 2, 'field' => 'berkas', 'value' => '', 'message' => 'Berkas tidak berisi baris data.'];
            }
        }

        $status = $errors ? 'REJECTED' : 'VALID';

        return DB::transaction(function () use ($file, $user, $rows, $errors, $valid, $status) {
            $upload = SalesAchievementUpload::create([
                'filename' => $file->getClientOriginalName(),
                'status' => $status,
                'total_rows' => count($rows),
                'error_count' => count($errors),
                'errors' => $errors ? array_slice($errors, 0, self::SHOWN_ERRORS) : null,
                'uploaded_by' => $user->id,
            ]);

            if ($status === 'VALID') {
                // baris periode+kode_sales yang sama dari upload sebelumnya digantikan (upload terbaru menang)
                foreach (array_chunk($valid, 500) as $chunk) {
                    foreach ($chunk as $r) {
                        SalesAchievementRow::where('period', $r['period'])->where('salesperson_code', $r['salesperson_code'])->delete();
                    }
                    SalesAchievementRow::insert(array_map(fn ($r) => $r + ['upload_id' => $upload->id, 'created_at' => now(), 'updated_at' => now()], $chunk));
                }
            }

            $this->auditLogService->log($user->id, 'sales_achievement.upload', SalesAchievementUpload::class, $upload->id, null, [
                'status' => $status, 'rows' => count($rows), 'errors' => count($errors), 'file' => $upload->filename,
            ]);

            return $upload->load('uploader:id,name');
        });
    }

    /** Dua dashboard Home untuk satu sales: Last Achievement (periode sebelumnya) dan Actual Achievement (periode berjalan vs target). */
    public function dashboardFor(User $user, ?string $period = null): array
    {
        $current = $period ?? now()->format('Y-m');
        $last = date('Y-m', strtotime($current.'-01 -1 month'));

        $currentRow = SalesAchievementRow::where('period', $current)->where('salesperson_id', $user->id)->first();
        $lastRow = SalesAchievementRow::where('period', $last)->where('salesperson_id', $user->id)->first();

        return [
            'actual' => [
                'period' => $current,
                'target' => $currentRow ? (float) $currentRow->target : null,
                'actual' => $currentRow ? (float) $currentRow->actual : null,
            ],
            'last' => [
                'period' => $last,
                'actual' => $lastRow ? (float) $lastRow->actual : null,
            ],
        ];
    }

    /** @return array<string, int> kode huruf kecil => user id */
    private function lookupSalesmen(array $codes): array
    {
        $codes = array_values(array_unique(array_filter(array_map(fn ($c) => mb_strtolower(trim((string) $c)), $codes), fn ($c) => $c !== '')));
        $found = [];
        if (! $codes) {
            return $found;
        }
        foreach (array_chunk($codes, 500) as $chunk) {
            foreach (DB::table('users')->whereRaw('LOWER(salesperson_code) IN ('.implode(',', array_fill(0, count($chunk), '?')).')', $chunk)->get(['id', 'salesperson_code']) as $row) {
                $found[mb_strtolower(trim((string) $row->salesperson_code))] = (int) $row->id;
            }
        }

        return $found;
    }

    /** @return array{0: array<int, array{no: int, cells: array<string, string>}>, 1: ?string} */
    private function readCsv(UploadedFile $file): array
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

        $missing = array_values(array_diff($this->requiredColumns(), $header));
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