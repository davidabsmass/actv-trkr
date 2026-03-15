import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { CheckCircle2, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

export function WhatsWorking() {
  const { orgId } = useOrg();

  const { data: findings } = useQuery({
    queryKey: ["dashboard_positive_findings", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("nightly_summaries")
        .select("top_findings")
        .eq("org_id", orgId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const all = (data?.top_findings as any[]) || [];
      return all.filter((f: any) => f.positive).slice(0, 4);
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
