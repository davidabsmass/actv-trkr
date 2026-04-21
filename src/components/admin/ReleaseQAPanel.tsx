import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { pluginManifest } from "@/generated/plugin-manifest";
import {
  RELEASE_QA_CHECKS,
  RELEASE_QA_CATEGORY_LABEL,
  type CheckCategoryKey,
  type ReleaseQACheck,
} from "@/data/releaseQAChecks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2, XCircle, AlertTriangle, CircleDashed, PlayCircle,
  RotateCcw, ChevronDown, ChevronRight, ShieldCheck, Loader2, Clock, Flame,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * Ship-blocker checks — the 4 critical manual/hybrid items that MUST be
 * verified before pushing a release. Surfaced with a 🔴 badge + filter toggle.
 */
const SHIP_BLOCKER_KEYS = new Set<string>([
  "lifecycle.checkout_to_active_manual",
  "security_boundaries.rls_smoke_test_manual",
  "plugin.install_manual",
  "tracking.consent_strict_inert_manual",
]);

type ResultRow = {
  id: string;
  run_id: string;
  check_key: string;
  category_key: string;
  check_type: string;
  severity: string;
  status: "pass" | "fail" | "warn" | "not_run" | "manual_pending" | "error";
  duration_ms: number | null;
  message: string | null;
  evidence: any;
  ran_at: string;
};

type RunRow = {
  id: string;
  app_version: string;
  started_by_email: string | null;
  started_at: string;
  completed_at: string | null;
  status: "running" | "passed" | "passed_with_warnings" | "failed" | "cancelled";
  scope: string;
  totals: Record<string, number>;
  ship_blocked?: boolean | null;
};

const statusColor: Record<string, string> = {
  pass: "text-success",
  fail: "text-destructive",
  warn: "text-warning",
  not_run: "text-muted-foreground",
  manual_pending: "text-warning",
  error: "text-destructive",
};

const StatusIcon = ({ status }: { status: string }) => {
  const cls = `h-4 w-4 ${statusColor[status] ?? "text-muted-foreground"}`;
  if (status === "pass") return <CheckCircle2 className={cls} />;
  if (status === "fail" || status === "error") return <XCircle className={cls} />;
  if (status === "warn") return <AlertTriangle className={cls} />;
  if (status === "manual_pending") return <Clock className={cls} />;
  return <CircleDashed className={cls} />;
};

const VerdictBadge = ({ status }: { status: RunRow["status"] }) => {
  if (status === "passed")
    return <Badge className="bg-success text-success-foreground">READY TO SHIP</Badge>;
  if (status === "passed_with_warnings")
    return <Badge className="bg-warning text-warning-foreground">READY WITH WARNINGS</Badge>;
  if (status === "failed")
    return <Badge variant="destructive">NOT READY</Badge>;
  if (status === "running")
    return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
  return <Badge variant="outline">{status}</Badge>;
};

export default function ReleaseQAPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const version = pluginManifest.version;
  const [runningScope, setRunningScope] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  const [signoffNotes, setSignoffNotes] = useState<Record<string, string>>({});
  const [shipBlockersOnly, setShipBlockersOnly] = useState(false);

  const { data: runs } = useQuery({
    queryKey: ["release_qa_runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("release_qa_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
  });

  const latestRun = runs?.[0];

  const { data: results } = useQuery({
    queryKey: ["release_qa_results", latestRun?.id],
    queryFn: async () => {
      if (!latestRun) return [] as ResultRow[];
      const { data, error } = await (supabase as any)
        .from("release_qa_results")
        .select("*")
        .eq("run_id", latestRun.id);
      if (error) throw error;
      return (data ?? []) as ResultRow[];
    },
    enabled: !!latestRun,
  });

  const { data: signoffs } = useQuery({
    queryKey: ["release_qa_signoffs", version],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("release_qa_manual_signoff")
        .select("*")
        .eq("app_version", version);
      if (error) throw error;
      return data as any[];
    },
  });

  const signoffMap = useMemo(() => {
    const m = new Map<string, any>();
    (signoffs || []).forEach((s) => m.set(s.check_key, s));
    return m;
  }, [signoffs]);

  const resultMap = useMemo(() => {
    const m = new Map<string, ResultRow>();
    (results || []).forEach((r) => m.set(r.check_key, r));
    return m;
  }, [results]);

  const grouped = useMemo(() => {
    const out: Record<string, ReleaseQACheck[]> = {};
    const source = shipBlockersOnly
      ? RELEASE_QA_CHECKS.filter((c) => SHIP_BLOCKER_KEYS.has(c.key))
      : RELEASE_QA_CHECKS;
    for (const c of source) {
      if (!out[c.category]) out[c.category] = [];
      out[c.category].push(c);
    }
    return out;
  }, [shipBlockersOnly]);

  // Ship-blocker progress: how many of the 4 are signed off / passing?
  const shipBlockerStats = useMemo(() => {
    const total = SHIP_BLOCKER_KEYS.size;
    let done = 0;
    for (const key of SHIP_BLOCKER_KEYS) {
      const r = resultMap.get(key);
      const so = signoffMap.get(key);
      if (so || r?.status === "pass") done += 1;
    }
    return { done, total, complete: done === total };
  }, [resultMap, signoffMap]);

  const runQA = async (scope: string) => {
    setRunningScope(scope);
    try {
      const { data, error } = await supabase.functions.invoke("run-release-qa", {
        body: { app_version: version, scope },
      });
      if (error) throw error;
      const totals = (data as any)?.totals ?? {};
      const status = (data as any)?.status;
      toast.success(
        `Run complete: ${status} — ✅${totals.pass ?? 0} ⚠️${totals.warn ?? 0} ⏳${totals.manual_pending ?? 0} ❌${(totals.fail ?? 0) + (totals.error ?? 0)}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["release_qa_runs"] });
      await queryClient.invalidateQueries({ queryKey: ["release_qa_results"] });
    } catch (e: any) {
      toast.error(`Run failed: ${e?.message ?? e}`);
    } finally {
      setRunningScope(null);
    }
  };

  const signOff = async (checkKey: string) => {
    if (!user) return toast.error("Sign in required");
    const notes = signoffNotes[checkKey]?.trim() || null;
    const { error } = await (supabase as any)
      .from("release_qa_manual_signoff")
      .upsert(
        {
          app_version: version, check_key: checkKey,
          signed_off_by: user.id, signed_off_by_email: user.email, notes,
        },
        { onConflict: "app_version,check_key" },
      );
    if (error) return toast.error(`Sign-off failed: ${error.message}`);
    toast.success("Signed off");
    setSignoffNotes((p) => ({ ...p, [checkKey]: "" }));
    await queryClient.invalidateQueries({ queryKey: ["release_qa_signoffs", version] });
    if (latestRun) {
      await queryClient.invalidateQueries({ queryKey: ["release_qa_results", latestRun.id] });
    }
  };

  const clearSignOff = async (checkKey: string) => {
    const { error } = await (supabase as any)
      .from("release_qa_manual_signoff")
      .delete()
      .eq("app_version", version)
      .eq("check_key", checkKey);
    if (error) return toast.error(`Clear failed: ${error.message}`);
    toast.success("Sign-off cleared");
    await queryClient.invalidateQueries({ queryKey: ["release_qa_signoffs", version] });
  };

  const totals = latestRun?.totals ?? { pass: 0, fail: 0, warn: 0, manual_pending: 0, error: 0, not_run: 0 };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-6 w-6 text-primary mt-0.5" />
            <div>
              <CardTitle className="text-base">Release QA — v{version}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                One-click validation of the launch checklist. Automated checks run live; manual / hybrid checks require sign-off.
              </p>
            </div>
          </div>
          <Button
            onClick={() => runQA("full")}
            disabled={!!runningScope}
            size="sm"
          >
            {runningScope === "full" ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-1.5" />
            )}
            Run Full Release QA
          </Button>
        </CardHeader>
        <CardContent>
          {latestRun ? (
            <div className="space-y-2">
              {latestRun.ship_blocked && (
                <div className="flex items-center gap-2 rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-sm font-bold text-destructive">⛔ STOP SHIP</p>
                    <p className="text-xs text-destructive/80">
                      One or more critical checks failed. Do not release v{version} until resolved.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <VerdictBadge status={latestRun.status} />
                <span className="text-muted-foreground">
                  {format(new Date(latestRun.started_at), "PPp")}
                  {latestRun.started_by_email ? ` · ${latestRun.started_by_email}` : ""}
                </span>
                <div className="flex items-center gap-2 text-xs ml-auto">
                  <Badge variant="outline" className="text-success">✅ {totals.pass}</Badge>
                  <Badge variant="outline" className="text-warning">⚠️ {totals.warn}</Badge>
                  <Badge variant="outline" className="text-warning">⏳ {totals.manual_pending}</Badge>
                  <Badge variant="outline" className="text-destructive">
                    ❌ {(totals.fail ?? 0) + (totals.error ?? 0)}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No QA runs yet. Click <strong>Run Full Release QA</strong> to start.</p>
          )}
        </CardContent>
      </Card>

      {/* Grouped checks by category */}
      {(Object.keys(grouped) as CheckCategoryKey[]).map((cat) => {
        const checks = grouped[cat];
        const isOpen = openCats[cat] !== false; // default open
        const catResults = checks.map((c) => resultMap.get(c.key));
        const catFails = catResults.filter((r) => r?.status === "fail" || r?.status === "error").length;
        const catWarns = catResults.filter((r) => r?.status === "warn" || r?.status === "manual_pending").length;
        const catPasses = catResults.filter((r) => r?.status === "pass").length;
        return (
          <Card key={cat}>
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpenCats((p) => ({ ...p, [cat]: !isOpen }))}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <CardTitle className="text-sm">{RELEASE_QA_CATEGORY_LABEL[cat]}</CardTitle>
                  <span className="text-xs text-muted-foreground">({checks.length} checks)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {catPasses > 0 && <span className="text-success">✅ {catPasses}</span>}
                  {catWarns > 0 && <span className="text-warning">⚠️ {catWarns}</span>}
                  {catFails > 0 && <span className="text-destructive">❌ {catFails}</span>}
                  <Button
                    variant="ghost" size="sm" className="h-7 px-2 text-xs"
                    disabled={!!runningScope}
                    onClick={(e) => { e.stopPropagation(); runQA(`category:${cat}`); }}
                  >
                    {runningScope === `category:${cat}` ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    Rerun category
                  </Button>
                </div>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="space-y-2">
                {checks.map((check) => {
                  const r = resultMap.get(check.key);
                  const so = signoffMap.get(check.key);
                  const status: ResultRow["status"] = r?.status ?? (so ? "pass" : "not_run");
                  const evOpen = openEvidence[check.key];
                  return (
                    <div key={check.key} className="rounded-md border border-border p-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <StatusIcon status={status} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium">{check.title}</p>
                              <Badge variant="outline" className="text-[10px]">{check.type}</Badge>
                              <Badge
                                variant={check.severity === "critical" ? "destructive" : "outline"}
                                className="text-[10px]"
                              >
                                {check.severity}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{check.description}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              <span className="font-medium">Expected:</span> {check.expectedResult}
                            </p>
                            {r?.message && (
                              <p className={`text-xs mt-1 ${statusColor[status]}`}>
                                {r.message}
                                {r.duration_ms != null && (
                                  <span className="text-muted-foreground ml-1">({r.duration_ms}ms)</span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {check.type === "automated" && (
                            <Button
                              variant="ghost" size="sm" className="h-7 px-2 text-xs"
                              disabled={!!runningScope}
                              onClick={() => runQA(`check:${check.key}`)}
                            >
                              {runningScope === `check:${check.key}` ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3 mr-1" />
                              )}
                              Rerun
                            </Button>
                          )}
                          {r?.evidence && Object.keys(r.evidence).length > 0 && (
                            <Button
                              variant="ghost" size="sm" className="h-7 px-2 text-xs"
                              onClick={() => setOpenEvidence((p) => ({ ...p, [check.key]: !evOpen }))}
                            >
                              {evOpen ? "Hide" : "Evidence"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {evOpen && r?.evidence && (
                        <pre className="mt-2 text-[10px] bg-muted/40 rounded p-2 overflow-x-auto">
                          {JSON.stringify(r.evidence, null, 2)}
                        </pre>
                      )}

                      {/* Manual / hybrid sign-off */}
                      {(check.type === "manual" || check.type === "hybrid") && (
                        <div className="mt-2 pt-2 border-t border-border">
                          {check.manualSteps && check.manualSteps.length > 0 && (
                            <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside mb-2">
                              {check.manualSteps.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          )}
                          {so ? (
                            <div className="flex items-start justify-between gap-2 text-xs bg-muted/30 rounded p-2">
                              <div className="min-w-0">
                                <p>
                                  <span className="text-muted-foreground">Signed off by</span>{" "}
                                  <span className="font-medium">{so.signed_off_by_email ?? so.signed_off_by?.slice(0, 8)}</span>
                                  <span className="text-muted-foreground"> · {format(new Date(so.signed_off_at), "PPp")}</span>
                                </p>
                                {so.notes && <p className="text-muted-foreground italic mt-0.5">"{so.notes}"</p>}
                              </div>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => clearSignOff(check.key)}>
                                Clear
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <Textarea
                                placeholder="Notes / evidence (paste IDs, URLs, screenshot links)…"
                                value={signoffNotes[check.key] ?? ""}
                                onChange={(e) => setSignoffNotes((p) => ({ ...p, [check.key]: e.target.value }))}
                                rows={2}
                                className="text-xs"
                              />
                              <Button size="sm" className="h-7 text-xs" onClick={() => signOff(check.key)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Sign off for v{version}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Run history */}
      {runs && runs.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Recent runs</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs border-b border-border last:border-0 py-1.5">
                  <div className="flex items-center gap-2">
                    <VerdictBadge status={r.status} />
                    <span className="text-muted-foreground">v{r.app_version}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{format(new Date(r.started_at), "PPp")}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{r.scope}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-success">✅ {r.totals?.pass ?? 0}</span>
                    <span className="text-warning">⚠️ {r.totals?.warn ?? 0}</span>
                    <span className="text-warning">⏳ {r.totals?.manual_pending ?? 0}</span>
                    <span className="text-destructive">❌ {(r.totals?.fail ?? 0) + (r.totals?.error ?? 0)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
