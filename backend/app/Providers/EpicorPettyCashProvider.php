<?php
//backend/app/Providers/EpicorPettyCashProvider.php
namespace App\Providers\Data;

use App\Models\IntegrationLog;
use App\Models\User;
use App\Providers\Data\Contracts\PettyCashProviderInterface;
use App\Services\Epicor\EpicorClient;
use App\Services\Epicor\EpicorFunctionClient;
use Throwable;

class EpicorPettyCashProvider implements PettyCashProviderInterface
{
    public function __construct(
        private readonly EpicorClient $baq,
        private readonly EpicorFunctionClient $efx,
    ) {
    }

    public function cashDesks(): array
    {
        return config('pettycash.epicor.cash_desks', []);
    }

    public function references(string $cashDesk): array
    {
        $c = config('pettycash.epicor.columns');
        $d = $this->q($cashDesk);
        $filter = "{$c['cash_desk_id']} eq '{$d}' or {$c['dest_cash_desk_id']} eq '{$d}'";

        // BAQ sudah memfilter: Issue, Approved, Settle Gap > 0
        return array_map(fn ($r) => $this->row($r, $cashDesk), $this->baq->getBaq(config('pettycash.epicor.baq.reference'), $filter));
    }

    public function settlementCandidates(string $cashDesk): array
    {
        $c = config('pettycash.epicor.columns');
        $filter = "{$c['cash_desk_id']} eq '{$this->q($cashDesk)}'";

        // BAQ sudah memfilter: Receipt, bukan Cash Desk, Settle Gap > 0
        return array_map(fn ($r) => $this->row($r, $cashDesk), $this->baq->getBaq(config('pettycash.epicor.baq.settlement'), $filter));
    }

    /**
     * Kontrak EFx PettyCashSettle (dibuat BMT):
     *  IN : cashDeskID, referenceIDs[], settlementIDs[], notes, actingUser
     *  OUT: settlementID, settledAmount, totalReference, totalSettlement
     * Aturan alokasi, validasi & penulisan UD_PettyCashSettle dilakukan di dalam Function.
     */
    public function settle(string $cashDesk, array $referenceIds, array $settlementIds, ?string $notes, User $user, ?string $epicorUserId): array
    {
        $cfg = config('pettycash.epicor.efx');
        $payload = [
            'cashDeskID' => $cashDesk,
            'referenceIDs' => array_values(array_map('strval', $referenceIds)),
            'settlementIDs' => array_values(array_map('strval', $settlementIds)),
            'notes' => $notes ?? '',
            'actingUser' => $epicorUserId ?: ($user->username ?: $user->email),
        ];

        try {
            $res = $this->efx->call($cfg['library'], $cfg['settle'], $payload);
            $this->log($cfg['settle'], $payload, $res, null);
        } catch (Throwable $e) {
            $this->log($cfg['settle'], $payload, null, $e->getMessage());
            throw $e;
        }

        $total = (float) ($res['totalReference'] ?? 0);
        $totalSet = (float) ($res['totalSettlement'] ?? 0);
        $settled = (float) ($res['settledAmount'] ?? 0);

        return [
            'settlement_id' => $res['settlementID'] ?? null,
            'settled_amount' => $settled,
            'total_reference' => $total,
            'total_settlement' => $totalSet,
            'remaining_reference' => round($total - $settled, 2),
            'remaining_settlement' => round($totalSet - $settled, 2),
        ];
    }

    public function history(string $cashDesk, int $limit = 50): array
    {
        $c = config('pettycash.epicor.history_columns');
        $rows = $this->baq->getBaq(config('pettycash.epicor.baq.history'), "{$c['cash_desk_id']} eq '{$this->q($cashDesk)}'");

        return array_map(fn ($r) => [
            'id' => $r[$c['id']] ?? null,
            'cash_desk_id' => $cashDesk,
            'executed_at' => $r[$c['executed_at']] ?? null,
            'executed_by' => $r[$c['executed_by']] ?? null,
            'notes' => $r[$c['notes']] ?? null,
            'total_reference' => 0.0,
            'total_settlement' => 0.0,
            'settled_amount' => (float) ($r[$c['settled_amount']] ?? 0),
            'lines' => [], // v1: detail baris belum diambil dari Epicor
        ], array_slice($rows, 0, $limit));
    }

    private function row(array $r, string $desk): array
    {
        $c = config('pettycash.epicor.columns');
        $op = $this->normalizeOp((string) ($r[$c['operation_type']] ?? ''));
        $transfer = $op === 'CASH_DESK';
        $origin = (string) ($r[$c['cash_desk_id']] ?? '');
        $dest = (string) ($r[$c['dest_cash_desk_id']] ?? '');
        $amount = (float) ($r[$c['cash_amount']] ?? 0);
        $settled = (float) ($r[$c['settle_amount']] ?? 0);

        return [
            'id' => (string) ($r[$c['id']] ?? ''),
            'cash_desk_id' => $origin,
            'dest_cash_desk_id' => $dest ?: null,
            'legal_number' => $r[$c['legal_number']] ?? null,
            'doc_num' => (string) ($r[$c['doc_num']] ?? ''),
            'tran_date' => substr((string) ($r[$c['tran_date']] ?? ''), 0, 10),
            'operation_type' => $op,
            'incoming_transfer' => $transfer && $dest === $desk && $origin !== $desk,
            'selectable' => ! $transfer,
            'cash_amount' => $amount,
            'settle_amount' => $settled,
            'settle_gap' => round($amount - $settled, 2),
        ];
    }

    private function normalizeOp(string $v): string
    {
        $k = strtoupper(str_replace([' ', '_', '-'], '', $v));

        return match (true) {
            str_contains($k, 'CASHDESK') => 'CASH_DESK',
            str_contains($k, 'CUSTOMER') => 'CUSTOMER',
            str_contains($k, 'SUPPLIER'), str_contains($k, 'VENDOR') => 'SUPPLIER',
            str_contains($k, 'EMPLOYEE') => 'EMPLOYEE',
            default => $k,
        };
    }

    /** Escape tanda petik tunggal untuk literal OData. */
    private function q(string $v): string
    {
        return str_replace("'", "''", $v);
    }

    private function log(string $fn, array $req, ?array $res, ?string $error): void
    {
        try {
            IntegrationLog::create([
                'provider' => 'epicor',
                'direction' => 'outbound',
                'entity_type' => 'petty_cash_settlement',
                'endpoint' => $fn,
                'method' => 'POST',
                'status' => $error ? 'failed' : 'success',
                'request_payload' => $req,
                'response_payload' => $res,
                'error_message' => $error,
            ]);
        } catch (Throwable) {
            // pencatatan log tidak boleh menggagalkan proses utama
        }
    }
}