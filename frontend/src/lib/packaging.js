// frontend/src/lib/packaging.js
export function kgToPcs(kg, gramasi) {
  const k = Number(kg)
  const g = Number(gramasi)
  if (!(k > 0) || !(g > 0)) return 0
  const raw = Math.round((k * 1000) / g * 1e6) / 1e6
  return Math.max(1, Math.ceil(raw))
}

export function strataFor(tiers, productId, kg) {
  const k = Number(kg)
  if (!(k > 0)) return 0
  const fit = (tiers || [])
    .filter((t) => t.active !== false)
    .filter((t) => t.product_id == null || String(t.product_id) === String(productId))
    .filter((t) => k >= Number(t.min_kg) && (t.max_kg == null || k <= Number(t.max_kg)))
    .sort((a, b) => {
      const pa = a.product_id == null ? 1 : 0
      const pb = b.product_id == null ? 1 : 0
      return pa - pb || Number(b.min_kg) - Number(a.min_kg)
    })
  return fit.length ? Number(fit[0].discount_percent) : 0
}

export function cascadePercent(percents) {
  const multiplier = (percents || []).reduce((m, p) => m * (1 - Math.min(100, Math.max(0, Number(p) || 0)) / 100), 1)
  return Math.round((1 - multiplier) * 10000) / 100
}

export function effectivePercent(manual, strata) {
  return cascadePercent([strata, manual])
}

export function lineCalc({ tiers, productId, qtyKg, gramasi, unitPrice, manualPercent, discPercents }) {
  const pcs = kgToPcs(qtyKg, gramasi)
  const strata = strataFor(tiers, productId, qtyKg)
  const discs = discPercents || [manualPercent]
  const effective = cascadePercent([strata, ...discs])
  const gross = pcs * (Number(unitPrice) || 0)
  const total = Math.round(gross * (1 - effective / 100) * 100) / 100
  return { pcs, strata, effective, gross, total }
}