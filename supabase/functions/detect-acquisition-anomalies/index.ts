import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Rule {
  id: string;
  rule_key: string;
  rule_name: string;
  description: string | null;
  threshold_value: number | null;
  threshold_operator: string;
  severity: string;
  is_active: boolean;
  notify_email: boolean;
  notify_in_app: boolean;
}

interface AnomalyDraft {
  rule_key: string;
  rule_id: string;
  severity: string;
  title: string;
  description: string;
  metric_value: number | null;
  threshold_value: number | null;
  delta_pct: number | null;
  context: Record<string, unknown>;
  linked_org_id?: string | null;
  linked_customer_id?: string | null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function compare(value: number, threshold: number, op: string): boolean {
  switch (op) {
    case ">": return value > threshold;
    case ">=": return value >= threshold;
    case "<": return value < threshold;
    case "<=": return value <= threshold;
    case "=": return value === threshold;
    default: return false;
  }
}

// deno-lint-ignore no-explicit-any
async function evaluateRule(supabase: any, rule: Rule): Promise<AnomalyDraft[]> {
  const drafts: AnomalyDraft[] = [];
  const threshold = Number(rule.threshold_value ?? 0);

  if (rule.rule_key === "mrr_drop_pct" || rule.rule_key === "arr_growth_stall") {
    const { data: snapshots } = await supabase
      .from("acquisition_metric_snapshots")
      .select("metric_date, metric_value")
      .eq("metric_key", "mrr")
      .order("metric_date", { ascending: false })
      .limit(2);
    if (snapshots && snapshots.length === 2) {
      const current = Number((snapshots[0] as { metric_value: number | null }).metric_value ?? 0);
      const prev = Number((snapshots[1] as { metric_value: number | null }).metric_value ?? 0);
      if (prev > 0) {
        const deltaPct = ((current - prev) / prev) * 100;
        const triggerVal = rule.rule_key === "mrr_drop_pct" ? Math.abs(Math.min(deltaPct, 0)) : deltaPct;
        if (compare(triggerVal, threshold, rule.threshold_operator)) {
          drafts.push({
            rule_key: rule.rule_key, rule_id: rule.id, severity: rule.severity,
            title: rule.rule_name,
            description: `MRR moved ${deltaPct.toFixed(1)}% (from $${prev.toFixed(0)} to $${current.toFixed(0)})`,
            metric_value: triggerVal, threshold_value: threshold, delta_pct: deltaPct,
            context: { current_mrr: current, prev_mrr: prev },
          });
        }
      }
    }
  }

  if (rule.rule_key === "concentration_risk_pct") {
    const { data: contracts } = await supabase
      .from("customer_contracts")
      .select("customer_id, customer_name, mrr")
      .gt("mrr", 0);
    if (contracts && contracts.length > 0) {
      const total = (contracts as Array<{ mrr: number | null }>).reduce((s, c) => s + Number(c.mrr ?? 0), 0);
      if (total > 0) {
        for (const c of contracts as Array<{ customer_id: string; customer_name: string; mrr: number | null }>) {
          const pct = (Number(c.mrr ?? 0) / total) * 100;
          if (compare(pct, threshold, rule.threshold_operator)) {
            drafts.push({
              rule_key: rule.rule_key, rule_id: rule.id, severity: rule.severity,
              title: `${c.customer_name}: ${pct.toFixed(1)}% of MRR`,
              description: `Single customer concentration risk — ${c.customer_name} represents ${pct.toFixed(1)}% of total MRR ($${Number(c.mrr).toFixed(0)} of $${total.toFixed(0)})`,
              metric_value: pct, threshold_value: threshold, delta_pct: null,
              context: { customer_name: c.customer_name, mrr: c.mrr, total_mrr: total },
              linked_customer_id: c.customer_id,
            });
          }
        }
      }
    }
  }

  if (rule.rule_key === "high_value_customer_at_risk") {
    const { data: snaps } = await supabase
      .from("customer_health_snapshots")
      .select("customer_id, health_score, arr, snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(50);
    if (snaps) {
      const seen = new Set<string>();
      const top = (snaps as Array<{ customer_id: string; health_score: number | null; arr: number | null }>)
        .filter(s => { if (seen.has(s.customer_id)) return false; seen.add(s.customer_id); return true; })
        .sort((a, b) => Number(b.arr ?? 0) - Number(a.arr ?? 0))
        .slice(0, 10);
      for (const s of top) {
        const score = Number(s.health_score ?? 100);
        if (compare(score, threshold, rule.threshold_operator)) {
          drafts.push({
            rule_key: rule.rule_key, rule_id: rule.id, severity: rule.severity,
            title: `Top customer health: ${score}`,
            description: `High-value customer (ARR $${Number(s.arr ?? 0).toFixed(0)}) health score dropped to ${score}`,
            metric_value: score, threshold_value: threshold, delta_pct: null,
            context: { arr: s.arr, health_score: score },
            linked_customer_id: s.customer_id,
          });
        }
      }
    }
  }

  if (rule.rule_key === "gross_margin_drop") {
    const { data: fin } = await supabase
      .from("finance_monthly")
      .select("revenue, cogs_hosting, cogs_ai, cogs_support, cogs_other, month")
      .order("month", { ascending: false })
      .limit(1);
    if (fin && fin.length > 0) {
      const f = fin[0] as Record<string, number | null>;
      const rev = Number(f.revenue ?? 0);
      const cogs = Number(f.cogs_hosting ?? 0) + Number(f.cogs_ai ?? 0) + Number(f.cogs_support ?? 0) + Number(f.cogs_other ?? 0);
      if (rev > 0) {
        const margin = ((rev - cogs) / rev) * 100;
        if (compare(margin, threshold, rule.threshold_operator)) {
          drafts.push({
            rule_key: rule.rule_key, rule_id: rule.id, severity: rule.severity,
            title: `Gross margin: ${margin.toFixed(1)}%`,
            description: `Gross margin fell to ${margin.toFixed(1)}% (revenue $${rev.toFixed(0)}, COGS $${cogs.toFixed(0)})`,
            metric_value: margin, threshold_value: threshold, delta_pct: null,
            context: { revenue: rev, cogs },
          });
        }
      }
    }
  }

  return drafts;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { data: rules, error: rulesError } = await supabase
      .from("acquisition_anomaly_rules")
      .select("*")
      .eq("is_active", true);
    if (rulesError) throw rulesError;

    const allDrafts: AnomalyDraft[] = [];
    for (const r of (rules ?? []) as Rule[]) {
      const drafts = await evaluateRule(supabase, r);
      allDrafts.push(...drafts);
    }

    let inserted = 0;
    for (const d of allDrafts) {
      // Dedupe: skip if same rule_key + linked_customer_id has open anomaly in last 24h
      const dedupeQuery = supabase
        .from("acquisition_anomalies")
        .select("id")
        .eq("rule_key", d.rule_key)
        .eq("status", "open")
        .gte("detected_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      if (d.linked_customer_id) dedupeQuery.eq("linked_customer_id", d.linked_customer_id);
      const { data: existing } = await dedupeQuery.limit(1);
      if (existing && existing.length > 0) continue;

      const { error: insErr } = await supabase.from("acquisition_anomalies").insert(d);
      if (!insErr) inserted++;
    }

    return new Response(JSON.stringify({
      success: true,
      rules_evaluated: rules?.length ?? 0,
      anomalies_detected: allDrafts.length,
      anomalies_inserted: inserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("detect-acquisition-anomalies error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
