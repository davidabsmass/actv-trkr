import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, ShieldAlert, ShieldX, CheckCircle2, XCircle, ArrowRight, RefreshCw, Activity, KeyRound, ServerCrash, ListChecks } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

type ScoreResult = {
  score: number;
  status: "safe" | "needs_attention" | "at_risk" | "vulnerable" | "blocked";
  reasons: Array<{ label: string; category: string; weight: number }>;
  critical_count: number;
  high_count: number;
  active_api_keys: number;
  stale_api_keys: number;
  last_backup_at: string | null;
  last_restore_test_at: string | null;
  computed_at: string;
};

const STATUS_META: Record<ScoreResult["status"], { label: string; tone: string; icon: any }> = {
  safe: { label: "Secure", tone: "text-success", icon: ShieldCheck },
  needs_attention: { label: "Needs Attention", tone: "text-warning", icon: AlertTriangle },
  at_risk: { label: "At Risk", tone: "text-warning", icon: ShieldAlert },
  vulnerable: { label: "Vulnerable", tone: "text-destructive", icon: ShieldX },
  blocked: { label: "Blocked", tone: "text-destructive", icon: ShieldX },
};

export function SecurityOverviewTab({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { orgId } = useOrg();
  const qc = useQueryClient();

  const { data: score, isLoading, refetch } = useQuery({
    queryKey: ["security_score", orgId],
    queryFn: async (): Promise<ScoreResult | null> => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc("compute_security_score" as any, { p_org_id: orgId });
      if (error) throw error;
      return data as ScoreResult;
    },
    enabled: !!orgId,
    refetchInterval: 60_000,
  });

  const recordCheck = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("record_security_release_check" as any, { p_org_id: orgId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Release check recorded");
      qc.invalidateQueries({ queryKey: ["security_release_checks", orgId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to record check"),
  });

  const { data: signals } = useQuery({
    queryKey: ["security_signals_24h", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const [auth, perm, webhook, suspicious, upload, recent] = await Promise.all([
        supabase.from("security_audit_log").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("event_type", "auth_failure").gte("created_at", since),
        supabase.from("security_audit_log").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("event_type", "permission_violation").gte("created_at", since),
        supabase.from("webhook_verification_log").select("id", { count: "exact", head: true }).in("verification_status", ["signature_invalid", "replay_rejected"]).gte("created_at", since),
        supabase.from("security_audit_log").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("event_type", "suspicious_input").gte("created_at", since),
        supabase.from("security_audit_log").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("event_type", "rejected_upload").gte("created_at", since),
        supabase.from("security_audit_log").select("id, event_type, severity, message, created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(8),
      ]);
      return {
        auth: auth.count ?? 0,
        perm: perm.count ?? 0,
        webhook: webhook.count ?? 0,
        suspicious: suspicious.count ?? 0,
        upload: upload.count ?? 0,
        recent: recent.data ?? [],
      };
    },
    enabled: !!orgId,
  });

  const { data: attention } = useQuery({
    queryKey: ["security_attention", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("security_findings")
        .select("id, type, severity, title, description, recommended_fix, created_at")
        .eq("org_id", orgId)
        .eq("status", "open")
        .in("severity", ["critical", "high"])
        .order("severity", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    enabled: !!orgId,
  });

  if (isLoading || !score) {
    return (
      <Card>
        <CardContent className="py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const meta = STATUS_META[score.status];
  const StatusIcon = meta.icon;
  const safeToDeploy = score.score >= 70 && score.critical_count === 0;

  return (
    <div className="space-y-4">
      {/* Top cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Security Score</div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className={`text-4xl font-bold ${meta.tone}`}>{score.score}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <div className={`flex items-center gap-1.5 mt-1 text-sm font-medium ${meta.tone}`}>
              <StatusIcon className="h-4 w-4" /> {meta.label}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Deployment Status</div>
            <div className={`flex items-center gap-2 mt-2 text-lg font-semibold ${safeToDeploy ? "text-success" : "text-destructive"}`}>
              {safeToDeploy ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
              {safeToDeploy ? "Safe to Deploy" : "Not Safe to Deploy"}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 h-7 text-xs"
              onClick={() => recordCheck.mutate()}
              disabled={recordCheck.isPending}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${recordCheck.isPending ? "animate-spin" : ""}`} />
              Record check
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Open Critical</div>
            <div className="text-4xl font-bold mt-2 text-destructive">{score.critical_count}</div>
            <button className="text-xs text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1" onClick={() => onJumpTo("findings")}>
              View findings <ArrowRight className="h-3 w-3" />
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Open High</div>
            <div className="text-4xl font-bold mt-2 text-warning">{score.high_count}</div>
            <button className="text-xs text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1" onClick={() => onJumpTo("findings")}>
              View findings <ArrowRight className="h-3 w-3" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* Reasons reducing score */}
      {score.reasons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ListChecks className="h-4 w-4" /> What's affecting your score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {score.reasons.map((r, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="text-foreground">{r.label}</span>
                  <Badge variant="outline" className="text-xs">−{r.weight}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Attention required */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Attention required</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onJumpTo("findings")}>
            All findings <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {!attention || attention.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4">No critical or high findings open. Good job.</div>
          ) : (
            <div className="space-y-3">
              {attention.map((f) => (
                <div key={f.id} className="border-l-2 border-destructive/60 pl-3 py-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={f.severity === "critical" ? "destructive" : "secondary"} className="text-xs uppercase">
                      {f.severity}
                    </Badge>
                    <span className="font-medium text-sm">{f.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                  {f.recommended_fix && (
                    <p className="text-xs mt-1"><span className="font-medium">Fix: </span>{f.recommended_fix}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System signals */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> System signals (24h)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Signal label="Failed logins" value={signals?.auth ?? 0} />
            <Signal label="Permission denials" value={signals?.perm ?? 0} />
            <Signal label="Invalid webhooks" value={signals?.webhook ?? 0} />
            <Signal label="Suspicious input" value={signals?.suspicious ?? 0} />
            <Signal label="Rejected uploads" value={signals?.upload ?? 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ServerCrash className="h-4 w-4" /> Backups & restore
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Signal label="Last backup" value={score.last_backup_at ? formatDistanceToNow(new Date(score.last_backup_at), { addSuffix: true }) : "Never"} />
            <Signal label="Last restore test" value={score.last_restore_test_at ? formatDistanceToNow(new Date(score.last_restore_test_at), { addSuffix: true }) : "Never"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> API keys
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Signal label="Active" value={score.active_api_keys} />
            <Signal label="Stale (90d+ unused)" value={score.stale_api_keys} />
            <Button size="sm" variant="outline" className="w-full mt-2 h-7 text-xs" onClick={() => onJumpTo("api-keys")}>
              Manage keys
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">Recent security activity</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onJumpTo("events")}>
            All events <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {!signals?.recent.length ? (
            <div className="text-sm text-muted-foreground py-4">No recent events.</div>
          ) : (
            <div className="space-y-2">
              {signals.recent.map((e: any) => (
                <div key={e.id} className="flex items-start justify-between gap-3 text-sm border-b last:border-b-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.event_type}</div>
                    {e.message && <div className="text-xs text-muted-foreground truncate">{e.message}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">{e.severity}</Badge>
                    <span className="text-xs text-muted-foreground">{format(new Date(e.created_at), "MMM d, HH:mm")}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
