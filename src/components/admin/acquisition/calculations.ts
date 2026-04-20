// Pure calculation helpers for the Acquisition Readiness dashboard.
// Keep everything here so unit testing and reasoning stay simple.

import type { Subscriber, FinanceMonth, Contract } from "./useAcquisitionData";
import { lastNMonths, monthKey } from "@/lib/acquisition-utils";

export type MonthlyArrPoint = {
  month: string;
  mrr: number;
  arr: number;
  active_customers: number;
  new_arr: number;
  churned_arr: number;
  net_new_arr: number;
};

// Build monthly ARR/MRR series from subscribers timeline.
export function buildMonthlyArr(subs: Subscriber[], months = 24): MonthlyArrPoint[] {
  const keys = lastNMonths(months);
  const monthStarts = keys.map((k) => {
    const [y, m] = k.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 1));
  });

  const now = new Date();

  return keys.map((k, i) => {
    const start = monthStarts[i];
    const end = i + 1 < monthStarts.length ? monthStarts[i + 1] : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const isCurrentMonth = now >= start && now < end;

    const activeAtMonthEnd = subs.filter((s) => {
      // Exclude free-code / 100%-discount rows entirely — they never contribute MRR.
      if (Number(s.mrr || 0) <= 0) return false;

      const created = new Date(s.created_at);
      if (created >= end) return false;

      // For the CURRENT month, use real-time status. A sub that churned today
      // should drop out of MRR immediately, not wait until month-end.
      if (isCurrentMonth) {
        const status = (s.status || "").toLowerCase();
        if (status === "churned" || status === "canceled" || status === "paused" || status === "past_due") return false;
        return true;
      }

      // For HISTORICAL months, use the standard "still paying at month-end" rule.
      const churned = s.churn_date ? new Date(s.churn_date) : null;
      return !churned || churned >= end;
    });

    const newThisMonth = subs.filter((s) => {
      if (Number(s.mrr || 0) <= 0) return false;
      const created = new Date(s.created_at);
      return created >= start && created < end;
    });

    const churnedThisMonth = subs.filter((s) => {
      if (!s.churn_date) return false;
      const c = new Date(s.churn_date);
      return c >= start && c < end;
    });

    const mrr = activeAtMonthEnd.reduce((sum, s) => sum + Number(s.mrr || 0), 0);
    const new_arr = newThisMonth.reduce((sum, s) => sum + Number(s.mrr || 0) * 12, 0);
    const churned_arr = churnedThisMonth.reduce((sum, s) => sum + Number(s.mrr || 0) * 12, 0);

    return {
      month: k,
      mrr,
      arr: mrr * 12,
      active_customers: activeAtMonthEnd.length,
      new_arr,
      churned_arr,
      net_new_arr: new_arr - churned_arr,
    };
  });
}

export type RetentionPoint = {
  month: string;
  starting_arr: number;
  churned_arr: number;
  expansion_arr: number;
  contraction_arr: number;
  ending_arr: number;
  nrr: number | null;
  grr: number | null;
  logo_churn: number | null;
  starting_customers: number;
  churned_customers: number;
};

export function buildRetention(arr: MonthlyArrPoint[]): RetentionPoint[] {
  return arr.map((point, i) => {
    const prev = arr[i - 1];
    const startingArr = prev?.arr ?? 0;
    const startingCustomers = prev?.active_customers ?? 0;

    // We don't yet track expansion/contraction separately; derive net change
    const churnedArr = point.churned_arr;
    const grossChange = point.arr - startingArr + churnedArr - point.new_arr;
    const expansionArr = grossChange > 0 ? grossChange : 0;
    const contractionArr = grossChange < 0 ? -grossChange : 0;

    const churnedCustomers = startingCustomers + (point.active_customers - startingCustomers >= 0 ? 0 : startingCustomers - point.active_customers);
    // Approximation: assume 0 churned customers if growth, otherwise difference
    const churnedC = Math.max(0, startingCustomers - point.active_customers);

    return {
      month: point.month,
      starting_arr: startingArr,
      churned_arr: churnedArr,
      expansion_arr: expansionArr,
      contraction_arr: contractionArr,
      ending_arr: point.arr,
      nrr: startingArr > 0 ? ((startingArr + expansionArr - contractionArr - churnedArr) / startingArr) * 100 : null,
      grr: startingArr > 0 ? ((startingArr - contractionArr - churnedArr) / startingArr) * 100 : null,
      logo_churn: startingCustomers > 0 ? (churnedC / startingCustomers) * 100 : null,
      starting_customers: startingCustomers,
      churned_customers: churnedC,
    };
  });
}

// Concentration metrics from contracts (or fall back to subscribers).
export type ConcentrationMetrics = {
  total_arr: number;
  top_1_pct: number;
  top_5_pct: number;
  top_10_pct: number;
  top_5: Array<{ name: string; arr: number; pct: number }>;
  by_industry: Array<{ key: string; arr: number; pct: number }>;
  by_geography: Array<{ key: string; arr: number; pct: number }>;
  by_plan: Array<{ key: string; arr: number; pct: number }>;
};

export function buildConcentration(contracts: Contract[], subs: Subscriber[]): ConcentrationMetrics {
  // Prefer contracts data if present, else derive from subscribers
  const useContracts = contracts.length > 0;
  const items = useContracts
    ? contracts.map((c) => ({
        name: c.customer_name,
        arr: Number(c.acv || c.mrr * 12 || 0),
        industry: c.industry || "Unknown",
        geography: c.geography || "Unknown",
        plan: c.plan || "Unknown",
      }))
    : subs
        .filter((s) => s.status === "active")
        .map((s) => ({
          name: s.email,
          arr: Number(s.mrr || 0) * 12,
          industry: "Unknown",
          geography: "Unknown",
          plan: s.plan || "Unknown",
        }));

  const sorted = [...items].sort((a, b) => b.arr - a.arr);
  const total = sorted.reduce((s, x) => s + x.arr, 0);
  const sumTop = (n: number) => sorted.slice(0, n).reduce((s, x) => s + x.arr, 0);

  const groupBy = (key: "industry" | "geography" | "plan") => {
    const map = new Map<string, number>();
    items.forEach((x) => map.set(x[key], (map.get(x[key]) ?? 0) + x.arr));
    return Array.from(map.entries())
      .map(([k, v]) => ({ key: k, arr: v, pct: total > 0 ? (v / total) * 100 : 0 }))
      .sort((a, b) => b.arr - a.arr);
  };

  return {
    total_arr: total,
    top_1_pct: total > 0 ? (sumTop(1) / total) * 100 : 0,
    top_5_pct: total > 0 ? (sumTop(5) / total) * 100 : 0,
    top_10_pct: total > 0 ? (sumTop(10) / total) * 100 : 0,
    top_5: sorted.slice(0, 5).map((x) => ({ name: x.name, arr: x.arr, pct: total > 0 ? (x.arr / total) * 100 : 0 })),
    by_industry: groupBy("industry"),
    by_geography: groupBy("geography"),
    by_plan: groupBy("plan"),
  };
}

// Finance derived metrics
export type FinanceDerived = {
  latest: FinanceMonth | null;
  gross_margin_pct: number | null;
  burn_rate: number | null;
  burn_multiple: number | null;
  cash_runway_months: number | null;
  arr_per_employee: number | null;
  rule_of_40: number | null;
  monthly_series: Array<{
    month: string;
    revenue: number;
    cogs: number;
    opex: number;
    gross_margin_pct: number | null;
    burn: number;
    headcount: number;
  }>;
};

export function buildFinance(finance: FinanceMonth[], arr: MonthlyArrPoint[]): FinanceDerived {
  if (finance.length === 0) {
    return {
      latest: null,
      gross_margin_pct: null,
      burn_rate: null,
      burn_multiple: null,
      cash_runway_months: null,
      arr_per_employee: null,
      rule_of_40: null,
      monthly_series: [],
    };
  }

  const series = finance.map((f) => {
    const cogs = Number(f.cogs_hosting) + Number(f.cogs_ai) + Number(f.cogs_support) + Number(f.cogs_other);
    const opex = Number(f.opex_rd) + Number(f.opex_sm) + Number(f.opex_ga);
    const grossProfit = Number(f.revenue) - cogs;
    const burn = cogs + opex - Number(f.revenue);
    return {
      month: f.month.slice(0, 7),
      revenue: Number(f.revenue),
      cogs,
      opex,
      gross_margin_pct: f.revenue > 0 ? (grossProfit / Number(f.revenue)) * 100 : null,
      burn: Math.max(0, burn),
      headcount: f.headcount,
    };
  });

  const latest = finance[finance.length - 1];
  const latestSeries = series[series.length - 1];
  const burn = latestSeries.burn;

  // Net new ARR for current month (annualized monthly net new × 12 → use actual yearly)
  const latestArr = arr[arr.length - 1];
  const priorArr = arr[arr.length - 13] ?? arr[0];
  const yoyArrChange = latestArr ? latestArr.arr - (priorArr?.arr ?? 0) : 0;
  const burnMultiple = yoyArrChange > 0 && burn > 0 ? (burn * 12) / yoyArrChange : null;

  const arrPerEmployee = latest.headcount > 0 && latestArr ? latestArr.arr / latest.headcount : null;

  // Rule of 40: YoY growth % + EBITDA margin %
  const yoyGrowthPct = priorArr && priorArr.arr > 0 ? ((latestArr.arr - priorArr.arr) / priorArr.arr) * 100 : 0;
  const ebitdaMargin = latestSeries.revenue > 0 ? ((latestSeries.revenue - latestSeries.cogs - latestSeries.opex) / latestSeries.revenue) * 100 : 0;
  const ruleOf40 = yoyGrowthPct + ebitdaMargin;

  return {
    latest,
    gross_margin_pct: latestSeries.gross_margin_pct,
    burn_rate: burn,
    burn_multiple: burnMultiple,
    cash_runway_months: latest.cash_balance && burn > 0 ? Number(latest.cash_balance) / burn : null,
    arr_per_employee: arrPerEmployee,
    rule_of_40: ruleOf40,
    monthly_series: series,
  };
}

// Auto-flag risk rules that should always be re-evaluated client-side
export type AutoRiskCandidate = {
  key: string;
  risk_type: string;
  severity: string;
  title: string;
  description: string;
};

export function evaluateAutoRisks(
  concentration: ConcentrationMetrics,
  finance: FinanceDerived,
  retention: RetentionPoint[],
  contracts: Contract[],
): AutoRiskCandidate[] {
  const out: AutoRiskCandidate[] = [];

  if (concentration.top_1_pct > 20) {
    out.push({
      key: "top_customer_concentration",
      risk_type: "concentration",
      severity: concentration.top_1_pct > 35 ? "critical" : "high",
      title: `Top customer represents ${concentration.top_1_pct.toFixed(1)}% of ARR`,
      description: "Single-customer dependency above 20% raises material concentration risk in diligence.",
    });
  }
  if (concentration.top_5_pct > 50) {
    out.push({
      key: "top_5_concentration",
      risk_type: "concentration",
      severity: concentration.top_5_pct > 70 ? "high" : "medium",
      title: `Top 5 customers represent ${concentration.top_5_pct.toFixed(1)}% of ARR`,
      description: "Top-5 concentration above 50% is a recurring buyer concern.",
    });
  }

  if (finance.burn_multiple != null && finance.burn_multiple > 2) {
    out.push({
      key: "burn_multiple_high",
      risk_type: "financial",
      severity: finance.burn_multiple > 3 ? "high" : "medium",
      title: `Burn multiple is ${finance.burn_multiple.toFixed(2)}×`,
      description: "Burn multiple above 2 indicates inefficient growth and will be flagged by buyers.",
    });
  }
  if (finance.cash_runway_months != null && finance.cash_runway_months < 9) {
    out.push({
      key: "runway_short",
      risk_type: "financial",
      severity: finance.cash_runway_months < 6 ? "critical" : "high",
      title: `Cash runway is ${finance.cash_runway_months.toFixed(1)} months`,
      description: "Less than 9 months of runway materially impacts negotiating leverage.",
    });
  }
  if (finance.gross_margin_pct != null && finance.gross_margin_pct < 60) {
    out.push({
      key: "low_margin",
      risk_type: "financial",
      severity: "medium",
      title: `Gross margin is ${finance.gross_margin_pct.toFixed(1)}%`,
      description: "SaaS buyers expect 75%+ gross margin. Margins below 60% require explanation.",
    });
  }

  const recentNrr = retention.filter((r) => r.nrr != null).slice(-3);
  if (recentNrr.length === 3 && recentNrr.every((r) => (r.nrr ?? 0) < 90)) {
    out.push({
      key: "nrr_low",
      risk_type: "retention",
      severity: "high",
      title: "NRR below 90% for 3 consecutive months",
      description: "Sustained NRR below 90% indicates structural revenue churn.",
    });
  }

  // Renewal risk in next 90 days
  const ninetyDays = new Date();
  ninetyDays.setDate(ninetyDays.getDate() + 90);
  const upcomingRenewalArr = contracts
    .filter((c) => c.contract_end && new Date(c.contract_end) <= ninetyDays && new Date(c.contract_end) >= new Date())
    .reduce((sum, c) => sum + Number(c.acv || 0), 0);
  if (upcomingRenewalArr > 0 && concentration.total_arr > 0 && upcomingRenewalArr / concentration.total_arr > 0.25) {
    out.push({
      key: "renewal_cliff",
      risk_type: "retention",
      severity: "high",
      title: `${((upcomingRenewalArr / concentration.total_arr) * 100).toFixed(0)}% of ARR up for renewal in 90 days`,
      description: "A renewal cliff above 25% of ARR concentrated in 90 days is a top buyer concern.",
    });
  }

  return out;
}

// Diligence readiness score (0-100)
export function diligenceReadinessScore(items: Array<{ readiness_status: string }>): { score: number; ready: number; partial: number; missing: number; total: number } {
  const total = items.length;
  if (total === 0) return { score: 0, ready: 0, partial: 0, missing: 0, total: 0 };
  const ready = items.filter((i) => i.readiness_status === "ready").length;
  const partial = items.filter((i) => i.readiness_status === "partial").length;
  const missing = items.filter((i) => i.readiness_status === "missing").length;
  const score = Math.round(((ready * 1 + partial * 0.5) / total) * 100);
  return { score, ready, partial, missing, total };
}
