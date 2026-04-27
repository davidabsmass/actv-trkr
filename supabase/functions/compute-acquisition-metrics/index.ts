// Nightly computation of acquisition metrics:
// - Snapshots ARR, MRR, NRR, GRR, concentration, burn, runway, etc. into acquisition_metric_snapshots
// - Auto-upserts risk flags when thresholds breach (auto_generated = true)
// - Updates reconciliation_status rows for ARR/MRR with computed values

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

type Subscriber = {
  id: string; email: string; plan: string | null; status: string;
  mrr: number; created_at: string; churn_date: string | null;
};
type Contract = {
  id: string; customer_name: string; acv: number | null; mrr: number | null;
  industry: string | null; geography: string | null; plan: string | null;
  contract_end: string | null; auto_renew: boolean | null;
};
type FinanceMonth = {
  month: string; revenue: number | null; cogs_hosting: number | null; cogs_ai: number | null;
  cogs_support: number | null; cogs_other: number | null; opex_rd: number | null;
  opex_sm: number | null; opex_ga: number | null; cash_balance: number | null; headcount: number | null;
};

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${dd.getUTCFullYear()}-${String(dd.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function buildArr(subs: Subscriber[], months = 24) {
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
    const active = subs.filter((s) => {
      // Exclude free-code / 100%-discounted rows — they contribute zero MRR.
      if (Number(s.mrr || 0) <= 0) return false;
      const created = new Date(s.created_at);
      if (created >= end) return false;
      // CURRENT month: drop churned/canceled/paused/past_due immediately.
      if (isCurrentMonth) {
        const status = (s.status || "").toLowerCase();
        if (status === "churned" || status === "canceled" || status === "paused" || status === "past_due") return false;
        return true;
      }
      // HISTORICAL months: count anyone whose churn_date is after month-end.
      const churned = s.churn_date ? new Date(s.churn_date) : null;
      return !churned || churned >= end;
    });
    const fresh = subs.filter((s) => { if (Number(s.mrr || 0) <= 0) return false; const c = new Date(s.created_at); return c >= start && c < end; });
    const churned = subs.filter((s) => { if (!s.churn_date) return false; const c = new Date(s.churn_date); return c >= start && c < end; });
    const mrr = active.reduce((s, x) => s + Number(x.mrr || 0), 0);
    const new_arr = fresh.reduce((s, x) => s + Number(x.mrr || 0) * 12, 0);
    const churned_arr = churned.reduce((s, x) => s + Number(x.mrr || 0) * 12, 0);
    return { month: k, mrr, arr: mrr * 12, active: active.length, new_arr, churned_arr };
  });
}

function buildConcentration(contracts: Contract[], subs: Subscriber[]) {
  const items = contracts.length > 0
    ? contracts.map((c) => ({ name: c.customer_name, arr: Number(c.acv || (c.mrr ?? 0) * 12) }))
    : subs.filter((s) => s.status === "active").map((s) => ({ name: s.email, arr: Number(s.mrr || 0) * 12 }));
  const sorted = [...items].sort((a, b) => b.arr - a.arr);
  const total = sorted.reduce((s, x) => s + x.arr, 0);
  const sumTop = (n: number) => sorted.slice(0, n).reduce((s, x) => s + x.arr, 0);
  return {
    total_arr: total,
    top_1_pct: total > 0 ? (sumTop(1) / total) * 100 : 0,
    top_5_pct: total > 0 ? (sumTop(5) / total) * 100 : 0,
    top_10_pct: total > 0 ? (sumTop(10) / total) * 100 : 0,
    customer_count: items.length,
  };
}

function buildFinance(finance: FinanceMonth[], arr: ReturnType<typeof buildArr>) {
  if (finance.length === 0) return { gross_margin_pct: null, burn: null, burn_multiple: null, runway: null, arr_per_employee: null, rule_of_40: null };
  const latest = finance[finance.length - 1];
  const cogs = Number(latest.cogs_hosting || 0) + Number(latest.cogs_ai || 0) + Number(latest.cogs_support || 0) + Number(latest.cogs_other || 0);
  const opex = Number(latest.opex_rd || 0) + Number(latest.opex_sm || 0) + Number(latest.opex_ga || 0);
  const rev = Number(latest.revenue || 0);
  const burn = Math.max(0, cogs + opex - rev);
  const grossMargin = rev > 0 ? ((rev - cogs) / rev) * 100 : null;
  const latestArr = arr[arr.length - 1];
  const priorArr = arr[arr.length - 13] ?? arr[0];
  const yoyArrChange = latestArr ? latestArr.arr - (priorArr?.arr ?? 0) : 0;
  const burnMultiple = yoyArrChange > 0 && burn > 0 ? (burn * 12) / yoyArrChange : null;
  const headcount = Number(latest.headcount || 0);
  const arrPerEmp = headcount > 0 && latestArr ? latestArr.arr / headcount : null;
  const yoyGrowthPct = priorArr && priorArr.arr > 0 ? ((latestArr.arr - priorArr.arr) / priorArr.arr) * 100 : 0;
  const ebitdaMargin = rev > 0 ? ((rev - cogs - opex) / rev) * 100 : 0;
  return {
    gross_margin_pct: grossMargin,
    burn,
    burn_multiple: burnMultiple,
    runway: latest.cash_balance && burn > 0 ? Number(latest.cash_balance) / burn : null,
    arr_per_employee: arrPerEmp,
    rule_of_40: yoyGrowthPct + ebitdaMargin,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Allow either CRON_SECRET (scheduled) or service-role JWT (manual trigger)
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedCron = req.headers.get("x-cron-secret");
  const auth = req.headers.get("authorization") || "";
  const isCron = !!cronSecret && providedCron === cronSecret;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // For manual invokes, require admin role
  if (!isCron) {
    const token = auth.replace("Bearer ", "");
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: userData } = await supabase.auth.getUser(token);
    if (!userData?.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const [{ data: subs }, { data: contracts }, { data: finance }] = await Promise.all([
      supabase.from("subscribers").select("id,email,plan,status,mrr,created_at,churn_date"),
      supabase.from("customer_contracts").select("id,customer_name,acv,mrr,industry,geography,plan,contract_end,auto_renew"),
      supabase.from("finance_monthly").select("*").order("month", { ascending: true }),
    ]);

    const subscribers = (subs || []) as Subscriber[];
    const contractsList = (contracts || []) as Contract[];
    const financeList = (finance || []) as FinanceMonth[];

    const arr = buildArr(subscribers, 24);
    const latest = arr[arr.length - 1];
    const prior = arr[arr.length - 2];
    const yearAgo = arr[arr.length - 13] ?? arr[0];
    const concentration = buildConcentration(contractsList, subscribers);
    const fin = buildFinance(financeList, arr);

    // NRR / GRR (approximation from net change)
    const startingArr = prior?.arr ?? 0;
    const churnedArr = latest?.churned_arr ?? 0;
    const newArr = latest?.new_arr ?? 0;
    const grossChange = (latest?.arr ?? 0) - startingArr + churnedArr - newArr;
    const expansion = grossChange > 0 ? grossChange : 0;
    const contraction = grossChange < 0 ? -grossChange : 0;
    const nrr = startingArr > 0 ? ((startingArr + expansion - contraction - churnedArr) / startingArr) * 100 : null;
    const grr = startingArr > 0 ? ((startingArr - contraction - churnedArr) / startingArr) * 100 : null;
    const yoyGrowth = yearAgo && yearAgo.arr > 0 ? ((latest.arr - yearAgo.arr) / yearAgo.arr) * 100 : null;

    // Renewal risk
    const ninetyDays = new Date(); ninetyDays.setDate(ninetyDays.getDate() + 90);
    const renewalRiskArr = contractsList
      .filter((c) => c.contract_end && new Date(c.contract_end) <= ninetyDays && new Date(c.contract_end) >= new Date())
      .reduce((s, c) => s + Number(c.acv || 0), 0);

    const today = new Date().toISOString().slice(0, 10);
    const snapshots = [
      { metric_key: "arr", metric_name: "Annual Recurring Revenue", metric_value: latest?.arr ?? 0, source_system: "computed" },
      { metric_key: "mrr", metric_name: "Monthly Recurring Revenue", metric_value: latest?.mrr ?? 0, source_system: "computed" },
      { metric_key: "active_customers", metric_name: "Active Customers", metric_value: (latest as any)?.active_customers ?? latest?.active ?? 0, source_system: "computed" },
      { metric_key: "new_arr_month", metric_name: "New ARR (latest month)", metric_value: latest?.new_arr ?? 0, source_system: "computed" },
      { metric_key: "churned_arr_month", metric_name: "Churned ARR (latest month)", metric_value: latest?.churned_arr ?? 0, source_system: "computed" },
      { metric_key: "nrr", metric_name: "Net Revenue Retention %", metric_value: nrr, source_system: "computed" },
      { metric_key: "grr", metric_name: "Gross Revenue Retention %", metric_value: grr, source_system: "computed" },
      { metric_key: "yoy_arr_growth", metric_name: "YoY ARR Growth %", metric_value: yoyGrowth, source_system: "computed" },
      { metric_key: "top_1_concentration", metric_name: "Top Customer % of ARR", metric_value: concentration.top_1_pct, source_system: "computed" },
      { metric_key: "top_5_concentration", metric_name: "Top 5 % of ARR", metric_value: concentration.top_5_pct, source_system: "computed" },
      { metric_key: "top_10_concentration", metric_name: "Top 10 % of ARR", metric_value: concentration.top_10_pct, source_system: "computed" },
      { metric_key: "gross_margin", metric_name: "Gross Margin %", metric_value: fin.gross_margin_pct, source_system: "computed" },
      { metric_key: "burn", metric_name: "Monthly Burn", metric_value: fin.burn, source_system: "computed" },
      { metric_key: "burn_multiple", metric_name: "Burn Multiple", metric_value: fin.burn_multiple, source_system: "computed" },
      { metric_key: "runway_months", metric_name: "Cash Runway (months)", metric_value: fin.runway, source_system: "computed" },
      { metric_key: "arr_per_employee", metric_name: "ARR per Employee", metric_value: fin.arr_per_employee, source_system: "computed" },
      { metric_key: "rule_of_40", metric_name: "Rule of 40", metric_value: fin.rule_of_40, source_system: "computed" },
      { metric_key: "renewal_risk_arr_90d", metric_name: "ARR up for renewal (90d)", metric_value: renewalRiskArr, source_system: "computed" },
    ].map((s) => ({ ...s, metric_date: today }));

    // Insert snapshots (history)
    const { error: snapErr } = await supabase.from("acquisition_metric_snapshots").insert(snapshots);
    if (snapErr) console.error("snapshot insert failed:", snapErr);

    // Auto risk flags
    const autoFlags: Array<{ key: string; risk_type: string; severity: string; title: string; description: string }> = [];
    if (concentration.top_1_pct > 20) {
      autoFlags.push({ key: "top_customer_concentration", risk_type: "concentration", severity: concentration.top_1_pct > 35 ? "critical" : "high",
        title: `Top customer is ${concentration.top_1_pct.toFixed(1)}% of ARR`, description: "Single-customer dependency above 20% raises material concentration risk in diligence." });
    }
    if (concentration.top_5_pct > 50) {
      autoFlags.push({ key: "top_5_concentration", risk_type: "concentration", severity: concentration.top_5_pct > 70 ? "high" : "medium",
        title: `Top 5 customers are ${concentration.top_5_pct.toFixed(1)}% of ARR`, description: "Top-5 concentration above 50% is a recurring buyer concern." });
    }
    if (fin.burn_multiple != null && fin.burn_multiple > 2) {
      autoFlags.push({ key: "burn_multiple_high", risk_type: "financial", severity: fin.burn_multiple > 3 ? "high" : "medium",
        title: `Burn multiple is ${fin.burn_multiple.toFixed(2)}×`, description: "Burn multiple above 2 indicates inefficient growth and will be flagged by buyers." });
    }
    if (fin.runway != null && fin.runway < 9) {
      autoFlags.push({ key: "runway_short", risk_type: "financial", severity: fin.runway < 6 ? "critical" : "high",
        title: `Cash runway is ${fin.runway.toFixed(1)} months`, description: "Less than 9 months of runway materially impacts negotiating leverage." });
    }
    if (fin.gross_margin_pct != null && fin.gross_margin_pct < 60) {
      autoFlags.push({ key: "low_margin", risk_type: "financial", severity: "medium",
        title: `Gross margin is ${fin.gross_margin_pct.toFixed(1)}%`, description: "SaaS buyers expect 75%+ gross margin. Margins below 60% require explanation." });
    }
    if (renewalRiskArr > 0 && concentration.total_arr > 0 && renewalRiskArr / concentration.total_arr > 0.25) {
      autoFlags.push({ key: "renewal_cliff", risk_type: "retention", severity: "high",
        title: `${((renewalRiskArr / concentration.total_arr) * 100).toFixed(0)}% of ARR up for renewal in 90 days`,
        description: "A renewal cliff above 25% of ARR concentrated in 90 days is a top buyer concern." });
    }

    // Upsert auto flags by stable key — close stale ones first, then re-open as needed
    const activeKeys = new Set(autoFlags.map((f) => f.key));
    const { data: existingAuto } = await supabase
      .from("acquisition_risk_flags")
      .select("id, title, status")
      .eq("auto_generated", true)
      .eq("status", "open");

    // Resolve any auto-generated open flags whose underlying condition no longer holds
    for (const ex of existingAuto || []) {
      const matches = autoFlags.find((f) => ex.title.startsWith(f.title.split(" is ")[0]) || ex.title.includes(f.key));
      if (!matches && !Array.from(activeKeys).some((k) => ex.title.toLowerCase().includes(k.replace(/_/g, " ")))) {
        await supabase.from("acquisition_risk_flags").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", ex.id);
      }
    }

    // Insert any new auto flags (skip if a similar open flag already exists)
    for (const f of autoFlags) {
      const { data: dup } = await supabase
        .from("acquisition_risk_flags")
        .select("id")
        .eq("auto_generated", true)
        .eq("status", "open")
        .eq("risk_type", f.risk_type)
        .ilike("title", `%${f.key.split("_")[0]}%`)
        .maybeSingle();
      if (dup) {
        await supabase.from("acquisition_risk_flags").update({ title: f.title, description: f.description, severity: f.severity, updated_at: new Date().toISOString() }).eq("id", dup.id);
      } else {
        await supabase.from("acquisition_risk_flags").insert({ risk_type: f.risk_type, severity: f.severity, title: f.title, description: f.description, status: "open", auto_generated: true });
      }
    }

    // Update reconciliation_status with computed values for ARR/MRR
    for (const key of ["arr", "mrr"]) {
      const value = key === "arr" ? latest?.arr : latest?.mrr;
      await supabase.from("reconciliation_status").update({
        last_reconciled_at: new Date().toISOString(),
        notes: `Auto-computed: ${value?.toLocaleString("en-US", { style: "currency", currency: "USD" })}`,
        status: "reconciled",
      }).eq("metric_key", key);
    }

    return new Response(
      JSON.stringify({ ok: true, snapshots: snapshots.length, auto_flags: autoFlags.length, computed_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("compute-acquisition-metrics error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
