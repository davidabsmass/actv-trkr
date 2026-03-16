import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { CheckCircle2, TrendingUp } from "lucide-react";
import { subDays, format } from "date-fns";

interface PositiveFinding {
  title: string;
  explanation: string;
}

export function WhatsWorking() {
  const { orgId } = useOrg();

  const { data: findings } = useQuery({
    queryKey: ["dashboard_positive_findings", orgId],
    queryFn: async () => {
      if (!orgId) return [];

      // Try nightly summaries first
      const { data } = await supabase
        .from("nightly_summaries")
        .select("top_findings")
        .eq("org_id", orgId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const all = (data?.top_findings as any[]) || [];
      const positiveFromSummary = all.filter((f: any) => f.positive).slice(0, 4);
      if (positiveFromSummary.length > 0) return positiveFromSummary;

      // Fallback: compute positive signals from raw data
      const now = new Date();
      const curStart = format(subDays(now, 7), "yyyy-MM-dd") + "T00:00:00Z";
      const prevStart = format(subDays(now, 14), "yyyy-MM-dd") + "T00:00:00Z";
      const prevEnd = format(subDays(now, 7), "yyyy-MM-dd") + "T00:00:00Z";

      const [curSess, prevSess, curLeads, prevLeads] = await Promise.all([
        supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", curStart),
        supabase.from("sessions").select("*", { count: "exact", head: true }).eq("org_id", orgId).gte("started_at", prevStart).lt("started_at", prevEnd),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", curStart),
        supabase.from("leads").select("*", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "trashed").gte("submitted_at", prevStart).lt("submitted_at", prevEnd),
      ]);

      const cs = curSess.count || 0;
      const ps = prevSess.count || 0;
      const cl = curLeads.count || 0;
      const pl = prevLeads.count || 0;

      const results: PositiveFinding[] = [];

      if (ps > 0 && cs > ps * 1.1) {
        const pct = Math.round(((cs - ps) / ps) * 100);
        results.push({ title: "Traffic is growing", explanation: `Sessions up ${pct}% vs previous week (${cs} vs ${ps}).` });
      }

      if (pl > 0 && cl > pl * 1.1) {
        const pct = Math.round(((cl - pl) / pl) * 100);
        results.push({ title: "Lead volume is up", explanation: `Leads increased ${pct}% vs previous week (${cl} vs ${pl}).` });
      }

      if (cs > 0 && ps > 0) {
        const curCvr = cl / cs;
        const prevCvr = pl / ps;
        if (prevCvr > 0 && curCvr > prevCvr * 1.1) {
          const pct = Math.round(((curCvr - prevCvr) / prevCvr) * 100);
          results.push({ title: "Conversion rate improved", explanation: `CVR improved ${pct}% compared to last week.` });
        }
      }

      // Top performing source
      const { data: sessData } = await supabase
        .from("sessions")
        .select("utm_source, landing_referrer_domain")
        .eq("org_id", orgId)
        .gte("started_at", curStart)
        .limit(1000);

      if (sessData && sessData.length > 0) {
        const srcMap: Record<string, number> = {};
        for (const r of sessData) {
          const src = r.utm_source || r.landing_referrer_domain || "Direct";
          srcMap[src] = (srcMap[src] || 0) + 1;
        }
        const topSrc = Object.entries(srcMap).sort((a, b) => b[1] - a[1])[0];
        if (topSrc && topSrc[1] > 5) {
          results.push({ title: `Top source: ${topSrc[0]}`, explanation: `${topSrc[1]} sessions from ${topSrc[0]} this week.` });
        }
      }

      return results.slice(0, 4);
    },
    enabled: !!orgId,
  });

  return (
    <div className="glass-card p-5 animate-slide-up h-full">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-success" />
        What's Working
      </h3>
      {findings && findings.length > 0 ? (
        <div className="space-y-2.5">
          {findings.map((f: any, i: number) => (
            <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-success/5 border border-success/10">
              <TrendingUp className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{f.title}</p>
                {f.explanation && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{f.explanation}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Positive signals will appear here as data is collected.</p>
      )}
    </div>
  );
}
