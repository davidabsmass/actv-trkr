import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowUpDown, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/performance": "Performance",
  "/reports": "Reports",
  "/forms": "Forms",
  "/seo": "SEO",
  "/monitoring": "Site Monitoring",
  "/security": "Security",
  "/clients": "Users",
  "/admin-setup": "Setup & Inputs",
  "/settings": "Settings",
  "/exports": "Exports",
  "/notifications": "Notifications",
  "/account": "Account",
  "/get-started": "Get Started",
  "/onboarding": "Onboarding",
  "/visitor-journeys": "Visitor Journeys",
  "/compliance-setup": "Compliance Setup",
  "/site-integrity": "Site Integrity",
  "/forms/troubleshooting": "Forms Troubleshooting",
  "/pipeline-status": "Pipeline Status",
  "/owner-admin": "Owner Admin",
  "/archives": "Archives",
};

const INTERNAL_EMAILS = new Set([
  "smaccarroll11@gmail.com",
  "mmccrrlldm@gmail.com",
]);
const INTERNAL_DOMAINS = ["newuniformdesign.com", "absmass.com"];

function isInternal(email: string | null | undefined) {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (INTERNAL_EMAILS.has(lower)) return true;
  return INTERNAL_DOMAINS.some((d) => lower.endsWith("@" + d));
}

function friendlyPage(path: string | null, title: string | null) {
  if (!path) return title || "—";
  if (PAGE_TITLES[path]) return PAGE_TITLES[path];
  if (title && !title.startsWith("/")) return title;
  return path;
}

type Row = {
  id: string;
  user_id: string;
  org_id: string | null;
  page_path: string | null;
  page_title: string | null;
  created_at: string;
};

type ProfileMap = Record<string, { email: string; full_name: string | null }>;
type OrgMap = Record<string, string>;

const RANGE_OPTIONS = [
  { label: "Today", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 0 },
];

export default function SubscriberActivityPanel() {
  const [rangeDays, setRangeDays] = useState(30);
  const [hideInternal, setHideInternal] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [orgs, setOrgs] = useState<OrgMap>({});
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<"events" | "sessions" | "last">("events");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const since = rangeDays > 0
        ? new Date(Date.now() - rangeDays * 86400_000).toISOString()
        : new Date(0).toISOString();

      const [actRes, profRes, orgRes] = await Promise.all([
        supabase
          .from("user_activity_log" as any)
          .select("id,user_id,org_id,page_path,page_title,created_at")
          .eq("activity_type", "page_view")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase.from("profiles").select("user_id,email,full_name"),
        supabase.from("orgs").select("id,name"),
      ]);

      if (cancelled) return;

      const profMap: ProfileMap = {};
      (profRes.data || []).forEach((p: any) => {
        profMap[p.user_id] = { email: p.email, full_name: p.full_name };
      });
      const orgMap: OrgMap = {};
      (orgRes.data || []).forEach((o: any) => { orgMap[o.id] = o.name; });

      setProfiles(profMap);
      setOrgs(orgMap);
      setRows(((actRes.data as any) || []) as Row[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [rangeDays]);

  const filteredRows = useMemo(() => {
    if (!hideInternal) return rows;
    return rows.filter((r) => !isInternal(profiles[r.user_id]?.email));
  }, [rows, hideInternal, profiles]);

  // KPIs: DAU / WAU / MAU based on filtered rows
  const dauWauMau = useMemo(() => {
    const now = Date.now();
    const day = new Set<string>();
    const week = new Set<string>();
    const month = new Set<string>();
    rows.forEach((r) => {
      if (hideInternal && isInternal(profiles[r.user_id]?.email)) return;
      const age = now - new Date(r.created_at).getTime();
      if (age <= 86400_000) day.add(r.user_id);
      if (age <= 7 * 86400_000) week.add(r.user_id);
      if (age <= 30 * 86400_000) month.add(r.user_id);
    });
    return { dau: day.size, wau: week.size, mau: month.size };
  }, [rows, hideInternal, profiles]);

  // Per-user aggregation
  const userStats = useMemo(() => {
    const map = new Map<string, {
      user_id: string;
      events: number;
      days: Set<string>;
      lastSeen: string;
      pages: Map<string, number>;
      orgIds: Set<string>;
    }>();
    filteredRows.forEach((r) => {
      let entry = map.get(r.user_id);
      if (!entry) {
        entry = { user_id: r.user_id, events: 0, days: new Set(), lastSeen: r.created_at, pages: new Map(), orgIds: new Set() };
        map.set(r.user_id, entry);
      }
      entry.events++;
      entry.days.add(r.created_at.slice(0, 10));
      if (r.created_at > entry.lastSeen) entry.lastSeen = r.created_at;
      const label = friendlyPage(r.page_path, r.page_title);
      entry.pages.set(label, (entry.pages.get(label) || 0) + 1);
      if (r.org_id) entry.orgIds.add(r.org_id);
    });
    const arr = Array.from(map.values()).map((u) => {
      const sorted = Array.from(u.pages.entries()).sort((a, b) => b[1] - a[1]);
      return {
        ...u,
        sessions: u.days.size,
        topPage: sorted[0],
        secondPage: sorted[1],
        orgNames: Array.from(u.orgIds).map((id) => orgs[id] || "—").join(", "),
      };
    });
    arr.sort((a, b) => {
      if (sortKey === "events") return b.events - a.events;
      if (sortKey === "sessions") return b.sessions - a.sessions;
      return b.lastSeen.localeCompare(a.lastSeen);
    });
    return arr;
  }, [filteredRows, orgs, sortKey]);

  // Page popularity
  const pageStats = useMemo(() => {
    const pages = new Map<string, { views: number; users: Set<string> }>();
    filteredRows.forEach((r) => {
      const label = friendlyPage(r.page_path, r.page_title);
      let p = pages.get(label);
      if (!p) { p = { views: 0, users: new Set() }; pages.set(label, p); }
      p.views++;
      p.users.add(r.user_id);
    });
    const totalUsers = userStats.length || 1;
    return Array.from(pages.entries())
      .map(([page, v]) => ({
        page,
        views: v.views,
        users: v.users.size,
        pct: Math.round((v.users.size / totalUsers) * 100),
      }))
      .sort((a, b) => b.views - a.views);
  }, [filteredRows, userStats.length]);

  const stream = useMemo(() => filteredRows.slice(0, 200), [filteredRows]);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Subscriber Activity
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Pageview-level signal. Feature-click instrumentation pending.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="hide-internal" checked={hideInternal} onCheckedChange={setHideInternal} />
            <Label htmlFor="hide-internal" className="text-xs">Hide internal</Label>
          </div>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((r) => (
              <Button
                key={r.label}
                size="sm"
                variant={rangeDays === r.days ? "default" : "outline"}
                onClick={() => setRangeDays(r.days)}
                className="h-7 px-2 text-xs"
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <KpiMini label="DAU" value={dauWauMau.dau} />
          <KpiMini label="WAU" value={dauWauMau.wau} />
          <KpiMini label="MAU" value={dauWauMau.mau} />
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <Tabs defaultValue="users">
            <TabsList>
              <TabsTrigger value="users">Most Active Users</TabsTrigger>
              <TabsTrigger value="pages">Page Popularity</TabsTrigger>
              <TabsTrigger value="stream">Recent Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Org</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => setSortKey("events")}>
                        Events <ArrowUpDown className="inline h-3 w-3 ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => setSortKey("sessions")}>
                        Active days <ArrowUpDown className="inline h-3 w-3 ml-1" />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => setSortKey("last")}>
                        Last seen <ArrowUpDown className="inline h-3 w-3 ml-1" />
                      </TableHead>
                      <TableHead>Top page</TableHead>
                      <TableHead>2nd page</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userStats.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No activity in this range.</TableCell></TableRow>
                    ) : userStats.map((u) => {
                      const p = profiles[u.user_id];
                      return (
                        <TableRow key={u.user_id}>
                          <TableCell className="text-xs">
                            <div className="font-medium text-foreground">{p?.full_name || "—"}</div>
                            <div className="font-mono text-muted-foreground">{p?.email || u.user_id.slice(0, 8)}</div>
                          </TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate">{u.orgNames || "—"}</TableCell>
                          <TableCell className="text-xs font-mono">{u.events}</TableCell>
                          <TableCell className="text-xs font-mono">{u.sessions}</TableCell>
                          <TableCell className="text-xs">{formatDistanceToNow(new Date(u.lastSeen), { addSuffix: true })}</TableCell>
                          <TableCell className="text-xs">
                            {u.topPage ? <span>{u.topPage[0]} <span className="text-muted-foreground">({u.topPage[1]})</span></span> : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {u.secondPage ? <span>{u.secondPage[0]} <span className="text-muted-foreground">({u.secondPage[1]})</span></span> : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="pages">
              <div className="space-y-2">
                {pageStats.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-6">No activity in this range.</div>
                ) : pageStats.map((p) => {
                  const max = pageStats[0]?.views || 1;
                  const widthPct = (p.views / max) * 100;
                  return (
                    <div key={p.page} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground font-medium">{p.page}</span>
                        <span className="text-muted-foreground font-mono">
                          {p.views} views · {p.users} users · {p.pct}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${widthPct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="stream">
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Page</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stream.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No activity.</TableCell></TableRow>
                    ) : stream.map((r) => {
                      const p = profiles[r.user_id];
                      const internal = isInternal(p?.email);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {p?.email || r.user_id.slice(0, 8)}
                            {internal && <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0 h-4">internal</Badge>}
                          </TableCell>
                          <TableCell className="text-xs">{friendlyPage(r.page_path, r.page_title)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function KpiMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold text-foreground">{value}</div>
    </div>
  );
}
