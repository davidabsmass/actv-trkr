import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Heart, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props { orgId: string; orgName?: string }

interface Health {
  health_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  lifecycle_stage: string;
  churn_risk_reasons: Array<{ label: string; category: string }>;
  cancellation_intent: boolean;
  billing_risk: boolean;
  engagement_risk: boolean;
  setup_risk: boolean;
  computed_at: string;
  last_login_at: string | null;
  last_data_received_at: string | null;
}

interface RetentionEvent { id: string; event_name: string; event_category: string; occurred_at: string }
interface RetentionMessage { id: string; subject: string | null; status: string; sent_at: string | null; created_at: string; metadata: any }

const tone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary", medium: "outline", high: "default", critical: "destructive",
};

export function RetentionPanel({ orgId, orgName }: Props) {
  const [health, setHealth] = useState<Health | null>(null);
  const [events, setEvents] = useState<RetentionEvent[]>([]);
  const [messages, setMessages] = useState<RetentionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [hRes, eRes, mRes] = await Promise.all([
      supabase.from("retention_account_health").select("*").eq("org_id", orgId).maybeSingle(),
      supabase.from("retention_events").select("id, event_name, event_category, occurred_at").eq("org_id", orgId).order("occurred_at", { ascending: false }).limit(15),
      supabase.from("retention_messages").select("id, subject, status, sent_at, created_at, metadata").eq("org_id", orgId).order("created_at", { ascending: false }).limit(10),
    ]);
    setHealth(hRes.data as any);
    setEvents((eRes.data as any) || []);
    setMessages((mRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [orgId]);

  const recompute = async () => {
    setRefreshing(true);
    const { error } = await supabase.rpc("recompute_account_health", { p_org_id: orgId });
    setRefreshing(false);
    if (error) toast.error(error.message); else { toast.success("Health recomputed"); void load(); }
  };

  if (loading) {
    return <Card><CardContent className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></CardContent></Card>;
  }
  if (!health) {
    return <Card><CardContent className="py-6 text-sm text-muted-foreground">No retention data yet.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2"><Heart className="h-4 w-4" /> Retention {orgName ? `· ${orgName}` : ""}</CardTitle>
        <Button variant="ghost" size="sm" onClick={recompute} disabled={refreshing}>
          <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Recompute
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Health" value={String(health.health_score)} />
          <Stat label="Risk"><Badge variant={tone[health.risk_level]}>{health.risk_level}</Badge></Stat>
          <Stat label="Lifecycle" value={health.lifecycle_stage.replace(/_/g, " ")} />
          <Stat label="Last data" value={health.last_data_received_at ? new Date(health.last_data_received_at).toLocaleDateString() : "—"} />
        </div>

        {health.churn_risk_reasons.length > 0 && (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground mb-2"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Risk reasons</div>
            <div className="flex flex-wrap gap-1.5">
              {health.churn_risk_reasons.map((r, i) => (<Badge key={i} variant="outline" className="text-xs">{r.label}</Badge>))}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-foreground mb-2">Recent retention events</div>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events yet</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex items-center justify-between text-muted-foreground">
                  <span><span className="text-foreground font-mono">{e.event_name}</span> · {e.event_category}</span>
                  <span>{new Date(e.occurred_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-xs font-medium text-foreground mb-2">Recent communications</div>
          {messages.length === 0 ? (
            <p className="text-xs text-muted-foreground">No flow messages sent yet</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {messages.map((m) => (
                <li key={m.id} className="flex items-center justify-between text-muted-foreground">
                  <span className="truncate max-w-[60%]"><span className="text-foreground">{m.subject || m.metadata?.flow_slug || "—"}</span></span>
                  <span><Badge variant="outline" className="text-[10px]">{m.status}</Badge> {m.sent_at ? new Date(m.sent_at).toLocaleDateString() : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-card p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground capitalize">{children || value}</div>
    </div>
  );
}
