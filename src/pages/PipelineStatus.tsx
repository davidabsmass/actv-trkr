import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Clock,
  GitBranch,
  ShieldCheck,
  Bug,
  Package,
  FileCode,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type LatestRun = {
  id: number;
  run_number: number;
  status: string | null;
  conclusion: string | null;
  event: string;
  branch: string | null;
  actor: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
};

type WorkflowSummary = {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
  latest_run: LatestRun | null;
};

type RecentRun = LatestRun & { name: string };

type PipelineResponse = {
  repo: string;
  generated_at: string;
  workflows: WorkflowSummary[];
  recent_runs: RecentRun[];
};

function StatusIcon({ status, conclusion }: { status: string | null; conclusion: string | null }) {
  if (status && status !== "completed") {
    return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
  }
  if (conclusion === "success") return <CheckCircle2 className="h-4 w-4 text-success" />;
  if (conclusion === "failure" || conclusion === "timed_out") return <XCircle className="h-4 w-4 text-destructive" />;
  if (conclusion === "cancelled" || conclusion === "skipped") return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  return <AlertTriangle className="h-4 w-4 text-warning" />;
}

function StatusBadge({ status, conclusion }: { status: string | null; conclusion: string | null }) {
  if (status && status !== "completed") {
    return <Badge variant="secondary">{status}</Badge>;
  }
  const variant: "default" | "destructive" | "secondary" | "outline" =
    conclusion === "success" ? "default" : conclusion === "failure" ? "destructive" : "secondary";
  return <Badge variant={variant}>{conclusion ?? "unknown"}</Badge>;
}

export default function PipelineStatus() {
  const { isAdmin, loading: roleLoading } = useUserRole();

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<PipelineResponse | { error: string; detail?: string }>(
        "pipeline-status",
      );
      if (error) throw error;
      if (data && "error" in data) throw new Error(`${data.error}${data.detail ? ` — ${data.detail}` : ""}`);
      return data as PipelineResponse;
    },
    enabled: isAdmin,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (roleLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // ── Summary tiles ──────────────────────────────────────────
  const workflows = data?.workflows ?? [];
  const counts = workflows.reduce(
    (acc, w) => {
      const c = w.latest_run?.conclusion;
      const s = w.latest_run?.status;
      if (s && s !== "completed") acc.running += 1;
      else if (c === "success") acc.passing += 1;
      else if (c === "failure" || c === "timed_out") acc.failing += 1;
      else acc.other += 1;
      return acc;
    },
    { passing: 0, failing: 0, running: 0, other: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" /> Pipeline Status
          </h1>
          <p className="text-sm text-muted-foreground">
            Latest GitHub Actions runs for {data?.repo ?? "the connected repository"}.
            {data?.generated_at && (
              <> Updated {formatDistanceToNow(new Date(data.generated_at), { addSuffix: true })}.</>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-destructive mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Could not load pipeline status</p>
                <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
                <p className="text-xs text-muted-foreground">
                  Make sure the <code className="bg-muted px-1 rounded">GITHUB_TOKEN</code> and{" "}
                  <code className="bg-muted px-1 rounded">GITHUB_REPO</code> secrets are configured.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryTile label="Passing" value={counts.passing} tone="emerald" />
        <SummaryTile label="Failing" value={counts.failing} tone="destructive" />
        <SummaryTile label="Running" value={counts.running} tone="primary" />
        <SummaryTile label="Other" value={counts.other} tone="muted" />
      </div>

      <Tabs defaultValue="workflows" className="w-full">
        <TabsList>
          <TabsTrigger value="workflows">Workflows</TabsTrigger>
          <TabsTrigger value="recent">Recent runs</TabsTrigger>
          <TabsTrigger value="code-health">Code health</TabsTrigger>
          <TabsTrigger value="observability">Observability</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="mt-4">
          {isLoading ? (
            <SkeletonRows />
          ) : (
            <div className="grid gap-3">
              {workflows.map((wf) => (
                <Card key={wf.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <StatusIcon
                          status={wf.latest_run?.status ?? null}
                          conclusion={wf.latest_run?.conclusion ?? null}
                        />
                        <CardTitle className="text-base">{wf.name}</CardTitle>
                      </div>
                      <a href={wf.html_url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" className="gap-1 h-7">
                          <ExternalLink className="h-3 w-3" /> Workflow
                        </Button>
                      </a>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{wf.path}</p>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {wf.latest_run ? (
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <StatusBadge
                          status={wf.latest_run.status}
                          conclusion={wf.latest_run.conclusion}
                        />
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3" /> {wf.latest_run.branch ?? "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(wf.latest_run.updated_at), { addSuffix: true })}
                        </span>
                        <span>#{wf.latest_run.run_number} • {wf.latest_run.event}</span>
                        {wf.latest_run.actor && <span>by {wf.latest_run.actor}</span>}
                        <a
                          href={wf.latest_run.html_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline ml-auto"
                        >
                          View run →
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No runs yet.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
              {workflows.length === 0 && !error && (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    No workflows found.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recent" className="mt-4">
          {isLoading ? (
            <SkeletonRows />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {(data?.recent_runs ?? []).map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 text-sm">
                      <StatusIcon status={r.status} conclusion={r.conclusion} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{r.name}</p>
                        <p className="text-xs text-muted-foreground">
                          #{r.run_number} • {r.event} • {r.branch ?? "—"}
                          {r.actor && ` • ${r.actor}`}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
                      </span>
                      <a href={r.html_url} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </a>
                    </div>
                  ))}
                  {(data?.recent_runs ?? []).length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No recent runs.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="code-health" className="mt-4">
          <CodeHealthTab />
        </TabsContent>
        <TabsContent value="observability" className="mt-4">
          <ObservabilityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "destructive" | "primary" | "muted";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : tone === "primary"
          ? "text-primary"
          : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="h-4 w-1/3 bg-muted rounded animate-pulse mb-2" />
            <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type CodeFinding = {
  number: number;
  state: string;
  html_url: string;
  tool: string;
  rule_name: string;
  severity: string;
  description: string | null;
  message: string | null;
  path: string | null;
  line: number | null;
};
type DepFinding = {
  number: number;
  html_url: string;
  package: string;
  ecosystem: string | null;
  manifest: string | null;
  severity: string;
  summary: string | null;
  cve: string | null;
  ghsa: string | null;
  vulnerable_range: string | null;
  patched_version: string | null;
};
type CodeHealthResponse = {
  repo: string;
  generated_at: string;
  counts: { code: Record<string, number>; dependencies: Record<string, number> };
  code_findings: CodeFinding[];
  dep_findings: DepFinding[];
  errors?: Record<string, { status: number; detail: string }>;
};

function severityVariant(sev: string): "default" | "destructive" | "secondary" | "outline" {
  const s = sev?.toLowerCase();
  if (s === "critical" || s === "high" || s === "error") return "destructive";
  if (s === "medium" || s === "warning") return "default";
  return "secondary";
}

function CodeHealthTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["code-health"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<CodeHealthResponse | { error: string; detail?: string }>(
        "code-health",
      );
      if (error) throw error;
      if (data && "error" in data) throw new Error(`${data.error}${data.detail ? ` — ${data.detail}` : ""}`);
      return data as CodeHealthResponse;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <SkeletonRows />;
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Could not load code health</p>
              <p className="text-xs text-muted-foreground">{(error as Error).message}</p>
              <p className="text-xs text-muted-foreground">
                The GitHub token needs <code className="bg-muted px-1 rounded">security_events: read</code> scope to read Code Scanning alerts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const code = data?.code_findings ?? [];
  const deps = data?.dep_findings ?? [];

  return (
    <div className="space-y-6">
      {data?.errors && (
        <Card className="border-warning/50">
          <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
            {Object.entries(data.errors).map(([k, v]) => (
              <p key={k}>
                <span className="font-medium text-foreground">{k}:</span> {v.status} — {v.detail.slice(0, 200)}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Code scanning */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Code scanning ({code.length})</h2>
          <span className="text-xs text-muted-foreground">Semgrep + CodeQL findings on open code</span>
        </div>
        {code.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> No open code-scanning alerts.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {code.map((f) => (
                  <div key={`${f.tool}-${f.number}`} className="p-3 text-sm space-y-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                      <Badge variant="outline" className="font-mono text-[10px]">{f.tool}</Badge>
                      <span className="font-medium text-foreground">{f.rule_name}</span>
                      <a
                        href={f.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-primary hover:underline text-xs flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> View
                      </a>
                    </div>
                    {(f.message || f.description) && (
                      <p className="text-xs text-muted-foreground">{f.message ?? f.description}</p>
                    )}
                    {f.path && (
                      <p className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                        <FileCode className="h-3 w-3" />
                        {f.path}{f.line ? `:${f.line}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Dependency alerts */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Vulnerable dependencies ({deps.length})</h2>
          <span className="text-xs text-muted-foreground">Open Dependabot alerts</span>
        </div>
        {deps.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> No open dependency alerts.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {deps.map((d) => (
                  <div key={d.number} className="p-3 text-sm space-y-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <Badge variant={severityVariant(d.severity)}>{d.severity}</Badge>
                      <span className="font-mono font-medium text-foreground">{d.package}</span>
                      {d.ecosystem && (
                        <Badge variant="outline" className="text-[10px]">{d.ecosystem}</Badge>
                      )}
                      <a
                        href={d.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-primary hover:underline text-xs flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" /> View
                      </a>
                    </div>
                    {d.summary && <p className="text-xs text-muted-foreground">{d.summary}</p>}
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      {d.vulnerable_range && <span>Affects: <span className="font-mono">{d.vulnerable_range}</span></span>}
                      {d.patched_version && <span className="text-success">Patched: <span className="font-mono">{d.patched_version}</span></span>}
                      {d.cve && <span className="font-mono">{d.cve}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

// ── Observability tab (Phase 3, read-only) ─────────────────────
type RateLimitRow = {
  id: number;
  org_id: string | null;
  site_id: string | null;
  endpoint: string;
  bucket_type: string;
  bucket_key: string | null;
  observed_count: number;
  threshold: number | null;
  would_block: boolean;
  occurred_at: string;
};
type AnomalyRow = {
  id: string;
  org_id: string;
  site_id: string | null;
  anomaly_type: string;
  details: Record<string, unknown>;
  detected_at: string;
};
type HealthRow = {
  org_id: string;
  site_id: string | null;
  endpoint: string;
  last_event_at: string;
  last_status: string | null;
  total_events: number;
};

function ObservabilityTab() {
  const { data: limits, isLoading: l1 } = useQuery({
    queryKey: ["obs-rate-limits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_limit_log")
        .select("id, org_id, site_id, endpoint, bucket_type, bucket_key, observed_count, threshold, would_block, occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as RateLimitRow[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: anomalies, isLoading: l2 } = useQuery({
    queryKey: ["obs-anomalies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ingestion_anomalies")
        .select("id, org_id, site_id, anomaly_type, details, detected_at")
        .order("detected_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AnomalyRow[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: health, isLoading: l3 } = useQuery({
    queryKey: ["obs-tracking-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_health")
        .select("org_id, site_id, endpoint, last_event_at, last_status, total_events")
        .order("last_event_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as HealthRow[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="p-3 text-xs text-muted-foreground">
          Observability is in <span className="font-medium text-foreground">log-only mode</span>.
          Nothing here blocks or alters live tracking. Enforcement remains disabled until feature flags are turned on.
        </CardContent>
      </Card>

      {/* Rate-limit observations */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Rate-limit observations ({limits?.length ?? 0})
          </h2>
          <span className="text-xs text-muted-foreground">Most recent 50 — would-block events shown for visibility only</span>
        </div>
        {l1 ? (
          <SkeletonRows />
        ) : (limits ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> No rate-limit hits observed.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(limits ?? []).map((r) => (
                  <div key={r.id} className="p-3 text-sm flex flex-wrap items-center gap-2">
                    {r.would_block ? (
                      <Badge variant="destructive">would-block</Badge>
                    ) : (
                      <Badge variant="secondary">observed</Badge>
                    )}
                    <span className="font-mono text-xs text-foreground">{r.endpoint}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.observed_count}{r.threshold ? `/${r.threshold}` : ""} • {r.bucket_type}
                    </span>
                    {r.bucket_key && (
                      <span className="text-xs font-mono text-muted-foreground">
                        key:{r.bucket_key.slice(0, 12)}…
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(r.occurred_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Recent anomalies */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-semibold text-foreground">
            Recent anomalies ({anomalies?.length ?? 0})
          </h2>
          <span className="text-xs text-muted-foreground">Most recent 50</span>
        </div>
        {l2 ? (
          <SkeletonRows />
        ) : (anomalies ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" /> No anomalies recorded.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(anomalies ?? []).map((a) => (
                  <div key={a.id} className="p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{a.anomaly_type}</Badge>
                      <span className="text-xs font-mono text-muted-foreground">org:{a.org_id.slice(0, 8)}…</span>
                      {a.site_id && (
                        <span className="text-xs font-mono text-muted-foreground">site:{a.site_id.slice(0, 8)}…</span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(a.detected_at), { addSuffix: true })}
                      </span>
                    </div>
                    {a.details && Object.keys(a.details).length > 0 && (
                      <pre className="text-[10px] font-mono text-muted-foreground bg-muted/40 rounded p-2 overflow-x-auto">
                        {JSON.stringify(a.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Signal freshness per site/endpoint */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">
            Signal freshness ({health?.length ?? 0})
          </h2>
          <span className="text-xs text-muted-foreground">Last event per site & endpoint (top 100)</span>
        </div>
        {l3 ? (
          <SkeletonRows />
        ) : (health ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No tracking signals recorded yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {(health ?? []).map((h) => (
                  <div
                    key={`${h.org_id}-${h.site_id ?? "none"}-${h.endpoint}`}
                    className="p-3 text-sm flex flex-wrap items-center gap-2"
                  >
                    {h.last_status === "ok" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    ) : h.last_status ? (
                      <XCircle className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="font-mono text-xs text-foreground">{h.endpoint}</span>
                    <span className="text-xs font-mono text-muted-foreground">org:{h.org_id.slice(0, 8)}…</span>
                    {h.site_id && (
                      <span className="text-xs font-mono text-muted-foreground">site:{h.site_id.slice(0, 8)}…</span>
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      {h.total_events.toLocaleString()} events
                    </Badge>
                    <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(h.last_event_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
