import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useSearchParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpDown, TrendingUp, Users, DollarSign, AlertTriangle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SupportInbox from "@/components/admin/SupportInbox";
import RetentionDashboard from "@/components/admin/RetentionDashboard";
import AcquisitionReadiness from "@/components/admin/acquisition/AcquisitionReadiness";
import SubscriberActivityPanel from "@/components/admin/SubscriberActivityPanel";

type Subscriber = {
  id: string;
  email: string;
  site_url: string | null;
  plan: string;
  status: string;
  created_at: string;
  last_active_date: string | null;
  churn_date: string | null;
  churn_reason: string | null;
  mrr: number;
  ai_calls_per_day_avg: number;
  features_used: string[];
  white_label_enabled: boolean;
  report_downloads: number;
  referral_source: string | null;
};

type ErrorLog = {
  id: string;
  action: string;
  error_message: string | null;
  created_at: string;
};

type SortKey = "created_at" | "mrr" | "last_active_date" | "churn_date";

export default function OwnerAdmin() {
  const [searchParams] = useSearchParams();
  const secret = searchParams.get("secret");

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!secret) { setAuthorized(false); setLoading(false); return; }
    const verify = async () => {
      try {
        const res = await fetch(
          `https://qnnxlvoybbmmqoxuqyvf.supabase.co/functions/v1/admin-verify`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ secret }),
          }
        );
        const data = await res.json();
        if (!data.authorized) { setAuthorized(false); setLoading(false); return; }
        setAuthorized(true);

        const [subRes, errRes] = await Promise.all([
          supabase.from("subscribers").select("*"),
          supabase.from("error_logs").select("*").order("created_at", { ascending: false }).limit(100),
        ]);
        if (subRes.data) setSubscribers(subRes.data as any);
        if (errRes.data) setErrors(errRes.data as any);
      } catch { setAuthorized(false); }
      setLoading(false);
    };
    verify();
  }, [secret]);

  const active = useMemo(() => subscribers.filter((s) => s.status === "active"), [subscribers]);
  const churned = useMemo(() => subscribers.filter((s) => s.status === "churned"), [subscribers]);
  const pastDue = useMemo(() => subscribers.filter((s) => s.status === "past_due"), [subscribers]);

  // Only paying subscribers (mrr > 0) count toward MRR — excludes free-code
  // and 100%-discount subscribers whose effective MRR is zero.
  const paying = useMemo(() => active.filter((s) => Number(s.mrr || 0) > 0), [active]);
  const mrr = useMemo(() => paying.reduce((sum, s) => sum + Number(s.mrr), 0), [paying]);
  const arpu = paying.length ? mrr / paying.length : 0;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

  const signupsThisMonth = subscribers.filter((s) => s.created_at.startsWith(thisMonth)).length;
  const signupsLastMonth = subscribers.filter((s) => s.created_at.startsWith(lastMonthStr)).length;
  const churnRate = subscribers.length ? ((churned.length / subscribers.length) * 100).toFixed(1) : "0";

  // Feature intelligence
  const featureCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    active.forEach((s) => {
      const features = Array.isArray(s.features_used) ? s.features_used : [];
      features.forEach((f: string) => { counts[f] = (counts[f] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [active]);

  const avgAiCalls = active.length
    ? (active.reduce((sum, s) => sum + Number(s.ai_calls_per_day_avg), 0) / active.length).toFixed(1)
    : "0";

  // Referral breakdown
  const referralCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    subscribers.forEach((s) => {
      const src = s.referral_source || "Unknown";
      counts[src] = (counts[src] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [subscribers]);

  const sorted = useMemo(() => {
    return [...subscribers].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }, [subscribers, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  if (authorized === false) return <Navigate to="/" replace />;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">ACTV TRKR — Owner Dashboard</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard icon={DollarSign} label="MRR" value={`$${mrr.toFixed(0)}`} />
        <KpiCard icon={Users} label="Active" value={String(active.length)} />
        <KpiCard icon={TrendingUp} label="Churn Rate" value={`${churnRate}%`} />
        <KpiCard icon={DollarSign} label="ARPU" value={`$${arpu.toFixed(2)}`} />
        <KpiCard icon={Users} label="New (this mo)" value={`${signupsThisMonth} vs ${signupsLastMonth}`} />
        <KpiCard icon={AlertTriangle} label="Failed Payments" value={String(pastDue.length)} />
      </div>

      {/* Subscriber Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscribers ({subscribers.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("created_at")}>
                  Signup <ArrowUpDown className="inline h-3 w-3 ml-1" />
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("last_active_date")}>
                  Last Active <ArrowUpDown className="inline h-3 w-3 ml-1" />
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("mrr")}>
                  MRR <ArrowUpDown className="inline h-3 w-3 ml-1" />
                </TableHead>
                <TableHead>AI/day</TableHead>
                <TableHead>WL</TableHead>
                <TableHead className="cursor-pointer" onClick={() => toggleSort("churn_date")}>
                  Churn <ArrowUpDown className="inline h-3 w-3 ml-1" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.email}</TableCell>
                  <TableCell className="text-xs max-w-[160px] truncate">{s.site_url || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{s.plan}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs">{s.last_active_date ? new Date(s.last_active_date).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.status === "active" ? "default" : s.status === "past_due" ? "destructive" : "secondary"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell>${Number(s.mrr).toFixed(0)}</TableCell>
                  <TableCell>{Number(s.ai_calls_per_day_avg).toFixed(0)}</TableCell>
                  <TableCell>{s.white_label_enabled ? "✓" : "—"}</TableCell>
                  <TableCell className="text-xs">
                    {s.churn_date ? new Date(s.churn_date).toLocaleDateString() : "—"}
                    {s.churn_reason && <span className="block text-muted-foreground">{s.churn_reason}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Retention */}
      <RetentionDashboard />

      {/* Acquisition Readiness */}
      <AcquisitionReadiness />

      {/* Support Inbox */}
      <SupportInbox />

      {/* Product Intelligence & Acquisition */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Feature Usage</CardTitle></CardHeader>
          <CardContent>
            {featureCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <div className="space-y-2">
                {featureCounts.map(([name, count]) => (
                  <div key={name} className="flex justify-between text-sm">
                    <span className="text-foreground">{name}</span>
                    <span className="text-muted-foreground">{count} sites</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">AI Usage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Avg AI calls/site/day:</span>
              <span className="ml-2 font-mono text-foreground">{avgAiCalls}</span>
            </div>
            <div className="text-sm font-medium text-foreground">High usage sites:</div>
            {active
              .filter((s) => Number(s.ai_calls_per_day_avg) > 50)
              .map((s) => (
                <div key={s.id} className="text-xs flex justify-between">
                  <span className="truncate max-w-[140px]">{s.site_url || s.email}</span>
                  <Badge variant="destructive">{Number(s.ai_calls_per_day_avg).toFixed(0)}/day</Badge>
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Acquisition</CardTitle></CardHeader>
          <CardContent>
            {referralCounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet</p>
            ) : (
              <div className="space-y-2">
                {referralCounts.map(([src, count]) => (
                  <div key={src} className="flex justify-between text-sm">
                    <span className="text-foreground">{src}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Errors */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Errors ({errors.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {errors.slice(0, 20).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{new Date(e.created_at).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline">{e.action}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[400px] truncate">{e.error_message || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="text-lg font-bold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
