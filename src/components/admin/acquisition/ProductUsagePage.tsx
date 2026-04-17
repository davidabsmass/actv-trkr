import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Users, Globe, Zap } from "lucide-react";
import { AcqKpiCard } from "./AcqKpiCard";
import { fmtNumber, fmtPct } from "@/lib/acquisition-utils";
import type { AcquisitionData } from "./useAcquisitionData";

type SiteRow = { id: string; org_id: string; domain: string; status: string | null; last_heartbeat_at: string | null };
type RetentionEvent = { org_id: string; event_name: string; occurred_at: string };

export default function ProductUsagePage({ data }: { data: AcquisitionData }) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [activations, setActivations] = useState<RetentionEvent[]>([]);
  const [logins, setLogins] = useState<{ org_id: string; logged_in_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [s, a, l] = await Promise.all([
        supabase.from("sites").select("id,org_id,domain,status,last_heartbeat_at"),
        supabase.from("retention_events").select("org_id,event_name,occurred_at").in("event_name", ["first_data_received", "second_login", "first_dashboard_view"]),
        supabase.from("login_events").select("org_id,logged_in_at").gte("logged_in_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);
      if (s.data) setSites(s.data as SiteRow[]);
      if (a.data) setActivations(a.data as RetentionEvent[]);
      if (l.data) setLogins(l.data as { org_id: string; logged_in_at: string }[]);
      setLoading(false);
    })();
  }, []);

  const activeOrgs = new Set(data.subscribers.filter((s) => s.status === "active").map((s) => s.id));
  const activeSites = sites.filter((s) => s.status === "active" || s.status === "ok");
  const trackingEnabledRate = sites.length > 0 ? (activeSites.length / sites.length) * 100 : 0;

  const orgsActivated = new Set(activations.filter((e) => e.event_name === "first_data_received").map((e) => e.org_id));
  const totalSubs = data.subscribers.length;
  const activationRate = totalSubs > 0 ? (orgsActivated.size / totalSubs) * 100 : 0;

  // Time to activation
  const activationTimes: number[] = [];
  data.subscribers.forEach((s) => {
    const evt = activations.find((e) => e.event_name === "first_data_received" && e.org_id === s.id);
    if (evt) {
      const hrs = (new Date(evt.occurred_at).getTime() - new Date(s.created_at).getTime()) / 3600000;
      if (hrs > 0) activationTimes.push(hrs);
    }
  });
  activationTimes.sort((a, b) => a - b);
  const medianTta = activationTimes.length > 0 ? activationTimes[Math.floor(activationTimes.length / 2)] : null;

  // 30-day actives
  const activeOrgIds30d = new Set(logins.map((l) => l.org_id));
  const dau = activeOrgIds30d.size;

  // Avg sites per account
  const sitesPerAccountMap = new Map<string, number>();
  sites.forEach((s) => sitesPerAccountMap.set(s.org_id, (sitesPerAccountMap.get(s.org_id) ?? 0) + 1));
  const avgSitesPerAccount = sitesPerAccountMap.size > 0
    ? Array.from(sitesPerAccountMap.values()).reduce((a, b) => a + b, 0) / sitesPerAccountMap.size
    : 0;

  // Under-engaged accounts
  const underEngaged = data.subscribers.filter((s) => s.status === "active" && !activeOrgIds30d.has(s.id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Product Usage &amp; Stickiness</h2>
        <p className="text-sm text-muted-foreground mt-1">Customers actually use the product and usage supports retention.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <AcqKpiCard label="Active Accounts" value={fmtNumber(activeOrgs.size)} icon={Users} />
        <AcqKpiCard label="Connected Sites" value={fmtNumber(sites.length)} icon={Globe} />
        <AcqKpiCard label="Tracking Active %" value={fmtPct(trackingEnabledRate)} icon={Activity} tone={trackingEnabledRate >= 80 ? "success" : "warning"} />
        <AcqKpiCard label="Activation Rate" value={fmtPct(activationRate)} icon={Zap} hint="% of signups that received first data." />
        <AcqKpiCard label="MAU (30d)" value={fmtNumber(dau)} icon={Users} hint="Accounts that logged in within last 30 days." />
        <AcqKpiCard label="Avg Sites/Account" value={avgSitesPerAccount.toFixed(2)} icon={Globe} />
        <AcqKpiCard label="Time to Activation" value={medianTta != null ? `${medianTta.toFixed(1)}h` : "—"} icon={Zap} hint="Median hours between signup and first data." />
        <AcqKpiCard label="Under-engaged" value={fmtNumber(underEngaged.length)} icon={Activity} tone={underEngaged.length > activeOrgs.size * 0.3 ? "warning" : "default"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Under-Engaged Active Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {underEngaged.length === 0 ? (
            <p className="text-sm text-muted-foreground">All active accounts logged in within last 30 days.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">MRR</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {underEngaged.slice(0, 20).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-mono">{s.email}</TableCell>
                    <TableCell className="text-xs"><Badge variant="outline">{s.plan}</Badge></TableCell>
                    <TableCell className="text-xs text-right">${Number(s.mrr).toFixed(0)}</TableCell>
                    <TableCell className="text-xs">{new Date(s.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Site Tracking Health</CardTitle>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sites registered.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Last Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.slice(0, 20).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{s.domain}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant={s.tracking_status === "active" || s.tracking_status === "ok" ? "default" : "destructive"}>
                        {s.tracking_status ?? "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{s.last_seen_at ? new Date(s.last_seen_at).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {loading && <p className="text-xs text-muted-foreground">Loading usage signals…</p>}
    </div>
  );
}
