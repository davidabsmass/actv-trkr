// Valuation calculation utilities

export interface ValuationInputs {
  base_arr?: number | null;
  base_revenue?: number | null;
  base_ebitda?: number | null;
  growth_rate_pct?: number | null;
  ebitda_margin_pct?: number | null;

  ev_arr_multiple_low?: number | null;
  ev_arr_multiple_mid?: number | null;
  ev_arr_multiple_high?: number | null;
  ev_revenue_multiple_low?: number | null;
  ev_revenue_multiple_mid?: number | null;
  ev_revenue_multiple_high?: number | null;
  ev_ebitda_multiple_low?: number | null;
  ev_ebitda_multiple_mid?: number | null;
  ev_ebitda_multiple_high?: number | null;

  dcf_projection_years?: number | null;
  dcf_discount_rate_pct?: number | null;
  dcf_terminal_growth_pct?: number | null;
  dcf_terminal_multiple?: number | null;
  dcf_fcf_margin_pct?: number | null;
}

export interface ValuationBreakdown {
  arr_method: { low: number; mid: number; high: number } | null;
  revenue_method: { low: number; mid: number; high: number } | null;
  ebitda_method: { low: number; mid: number; high: number } | null;
  dcf_method: { value: number; terminal_value: number; fcf_pv_total: number } | null;
}

export interface ValuationResult {
  low: number;
  mid: number;
  high: number;
  breakdown: ValuationBreakdown;
}

const num = (v: number | null | undefined): number => (typeof v === "number" && !isNaN(v) ? v : 0);

function multipleMethod(base: number | null | undefined, low: number | null | undefined, mid: number | null | undefined, high: number | null | undefined) {
  const b = num(base);
  if (b <= 0 || (!low && !mid && !high)) return null;
  return {
    low: b * num(low),
    mid: b * num(mid),
    high: b * num(high),
  };
}

function dcfMethod(inputs: ValuationInputs) {
  const arr = num(inputs.base_arr) || num(inputs.base_revenue);
  const growth = num(inputs.growth_rate_pct) / 100;
  const fcfMargin = num(inputs.dcf_fcf_margin_pct) / 100;
  const discount = num(inputs.dcf_discount_rate_pct) / 100;
  const years = Math.max(1, Math.min(15, inputs.dcf_projection_years ?? 5));
  const terminalMultiple = num(inputs.dcf_terminal_multiple);
  const terminalGrowth = num(inputs.dcf_terminal_growth_pct) / 100;

  if (arr <= 0 || discount <= 0 || fcfMargin <= 0) return null;

  let fcfPvTotal = 0;
  let projectedRev = arr;
  let lastFcf = 0;
  for (let y = 1; y <= years; y++) {
    projectedRev = projectedRev * (1 + growth);
    const fcf = projectedRev * fcfMargin;
    const pv = fcf / Math.pow(1 + discount, y);
    fcfPvTotal += pv;
    lastFcf = fcf;
  }

  // Terminal value: prefer exit-multiple if provided; else Gordon Growth
  let terminalValue = 0;
  if (terminalMultiple > 0) {
    terminalValue = lastFcf * terminalMultiple;
  } else if (discount > terminalGrowth) {
    terminalValue = (lastFcf * (1 + terminalGrowth)) / (discount - terminalGrowth);
  }
  const terminalPv = terminalValue / Math.pow(1 + discount, years);

  return {
    value: fcfPvTotal + terminalPv,
    terminal_value: terminalValue,
    fcf_pv_total: fcfPvTotal,
  };
}

export function computeValuation(inputs: ValuationInputs): ValuationResult {
  const arrMethod = multipleMethod(inputs.base_arr, inputs.ev_arr_multiple_low, inputs.ev_arr_multiple_mid, inputs.ev_arr_multiple_high);
  const revenueMethod = multipleMethod(inputs.base_revenue, inputs.ev_revenue_multiple_low, inputs.ev_revenue_multiple_mid, inputs.ev_revenue_multiple_high);
  const ebitdaMethod = multipleMethod(inputs.base_ebitda, inputs.ev_ebitda_multiple_low, inputs.ev_ebitda_multiple_mid, inputs.ev_ebitda_multiple_high);
  const dcf = dcfMethod(inputs);

  const lows: number[] = [];
  const mids: number[] = [];
  const highs: number[] = [];

  if (arrMethod) { lows.push(arrMethod.low); mids.push(arrMethod.mid); highs.push(arrMethod.high); }
  if (revenueMethod) { lows.push(revenueMethod.low); mids.push(revenueMethod.mid); highs.push(revenueMethod.high); }
  if (ebitdaMethod) { lows.push(ebitdaMethod.low); mids.push(ebitdaMethod.mid); highs.push(ebitdaMethod.high); }
  if (dcf) {
    // Treat DCF as a mid; bracket it ±15% for low/high contribution
    lows.push(dcf.value * 0.85);
    mids.push(dcf.value);
    highs.push(dcf.value * 1.15);
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    low: avg(lows),
    mid: avg(mids),
    high: avg(highs),
    breakdown: {
      arr_method: arrMethod,
      revenue_method: revenueMethod,
      ebitda_method: ebitdaMethod,
      dcf_method: dcf,
    },
  };
}

export function formatCurrency(n: number, currency = "USD"): string {
  if (!isFinite(n) || n === 0) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: n >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}
