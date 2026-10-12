@php
    $idr = fn ($v) => 'Rp '.number_format((float) $v, 0, ',', '.');
    $day = fn ($d) => $d ? \Illuminate\Support\Carbon::parse($d)->format('d M Y') : '—';
    $code = $quote->lead_id ? 'QUO-'.(10000 + (int) $quote->lead_id) : $quote->quote_number;
    $customerName = $quote->customer?->name ?? $quote->lead?->business_name ?? '—';
    $address = $quote->customer?->address ?? $quote->lead?->address;
@endphp

<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Quotation {{ $code }}</title>
<style>
  body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #17202B; }
  h1 { font-size: 22px; margin: 0 0 2px; letter-spacing: 1px; }
  .muted { color: #6b7280; }
  .row { width: 100%; margin-bottom: 14px; }
  .col { display: inline-block; vertical-align: top; width: 49%; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 6px; }
  table.lines th { background: #F1EEE8; text-align: left; padding: 6px; font-size: 10px; }
  table.lines td { padding: 6px; border-bottom: 1px solid #E6E2DA; vertical-align: top; }
  .r { text-align: right; }
  .totals { width: 45%; margin-left: 55%; margin-top: 10px; }
  .totals td { padding: 3px 0; }
  .deal td { border-top: 1px solid #17202B; padding-top: 6px; font-weight: bold; font-size: 13px; }
  .box { border: 1px solid #E6E2DA; padding: 8px 10px; margin-top: 14px; }
  .label { font-size: 9px; text-transform: uppercase; letter-spacing: .6px; color: #9C9487; }
</style>
</head>
<body>
<div class="row">
  <h1>QUOTATION</h1>
  <div class="muted">{{ $code }}</div>
</div>

<div class="row">
  <div class="col">
    <div class="label">Customer</div>
    <div><b>{{ $customerName }}</b></div>
    @if ($address)<div class="muted">{{ $address }}</div>@endif
  </div>
  <div class="col">
    <div class="label">Date</div><div>{{ $day($quote->entry_date) }}</div>
    <div class="label" style="margin-top:6px">Valid until</div><div>{{ $day($quote->expires_at) }}</div>
    <div class="label" style="margin-top:6px">Term of Payment</div><div>{{ $quote->payment_term ?: '—' }}</div>
    @if ($quote->customer_po)
      <div class="label" style="margin-top:6px">Customer PO</div><div>{{ $quote->customer_po }}</div>
    @endif
  </div>
</div>

<table class="lines">
  <thead>
    <tr>
      <th>#</th><th>Product</th><th class="r">Qty (Kg)</th><th class="r">Qty (pcs)</th>
      <th class="r">Unit price</th><th class="r">Disc %</th><th class="r">Total</th>
    </tr>
  </thead>
  <tbody>
  @forelse ($quote->lines as $i => $line)
    <tr>
      <td>{{ $i + 1 }}</td>
      <td>{{ $line->product?->part_num }} {{ $line->description }}</td>
      <td class="r">{{ rtrim(rtrim(number_format((float) $line->qty_kg, 2, ',', '.'), '0'), ',') }}</td>
      <td class="r">{{ number_format((float) $line->qty_pcs, 0, ',', '.') }}</td>
      <td class="r">{{ $idr($line->unit_price) }}</td>
      <td class="r">{{ rtrim(rtrim(number_format((float) $line->effectivePercent(), 2, ',', '.'), '0'), ',') }}</td>
      <td class="r">{{ $idr($line->line_total) }}</td>
    </tr>
  @empty
    <tr><td colspan="7" class="muted">Belum ada baris.</td></tr>
  @endforelse
  </tbody>
</table>

<table class="totals">
  <tr><td>Total Gross</td><td class="r">{{ $idr($quote->subtotal) }}</td></tr>
  <tr><td>Line Disc</td><td class="r">{{ $idr($quote->discount_total) }}</td></tr>
  <tr class="deal"><td>Total Deal</td><td class="r">{{ $idr($quote->total) }}</td></tr>
</table>

@if ($quote->notes)
  <div class="box">
    <div class="label">Comment</div>
    <div>{!! nl2br(e($quote->notes)) !!}</div>
  </div>
@endif

<div class="muted" style="margin-top:18px">
  Prepared by {{ $quote->salesperson?->name ?? '—' }}@if ($quote->salesperson?->email) · {{ $quote->salesperson->email }}@endif
</div>
</body>
</html>