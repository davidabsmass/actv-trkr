import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { format } from "date-fns";
import { Shield, ChevronLeft, Download, Search, Filter, Eye } from "lucide-react";

const focusLabels: Record<string, string> = {
  lead_volume: "📈 Grow Lead Volume",
  marketing_impact: "💰 Marketing Impact",
  conversion_performance: "🎯 Conversion Performance",
  paid_optimization: "✂️ Paid Optimization",
  get_more_leads: "📈 Get More Leads",
  prove_roi: "💰 Prove ROI",
  improve_conversion: "🎯 Improve Conversion",
  reduce_ad_waste: "✂️ Reduce Ad Waste",
};

export default function AdminSetup() {
  const { isAdmin } = useUserRole();
  const navigate = useNavigate();
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [filterFocus, setFilterFocus] = useState<string>("");
  const [filterOnboarding, setFilterOnboarding] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [logPage, setLogPage] = useState(0);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const LOG_PAGE_SIZE = 20;

  // Fetch all orgs + settings + sites
  const { data: orgsData } = useQuery({
    queryKey: ["admin_orgs_setup"],
    queryFn: async () => {
      const { data: orgs, error } = await supabase.from("orgs").select("id, name, created_at");
      if (error) throw error;
      return orgs;
    },
  });

  const { data: allSettings } = useQuery({
    queryKey: ["admin_all_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_settings").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: allSites } = useQuery({
    queryKey: ["admin_all_sites"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sites").select("id, domain, org_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: latestEvents } = useQuery({
    queryKey: ["admin_latest_events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_input_events")
        .select("org_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  // Selected org detail data
  const { data: onboardingResponse } = useQuery({
    queryKey: ["admin_onboarding", selectedOrg],
    queryFn: async () => {
      if (!selectedOrg) return null;
      const { data, error } = await supabase
        .from("onboarding_responses")
        .select("*")
        .eq("org_id", selectedOrg)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg,
  });

  const { data: orgEvents } = useQuery({
    queryKey: ["admin_org_events", selectedOrg, logPage],
    queryFn: async () => {
      if (!selectedOrg) return [];
      const { data, error } = await supabase
        .from("user_input_events")
        .select("*")
        .eq("org_id", selectedOrg)
        .order("created_at", { ascending: false })
        .range(logPage * LOG_PAGE_SIZE, (logPage + 1) * LOG_PAGE_SIZE - 1);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrg,
  });

  // Build enriched org list
  const enrichedOrgs = useMemo(() => {
    if (!orgsData) return [];
    const settingsMap: Record<string, any> = {};
    allSettings?.forEach((s) => { settingsMap[s.org_id] = s; });
    const sitesMap: Record<string, any[]> = {};
    allSites?.forEach((s) => { if (!sitesMap[s.org_id]) sitesMap[s.org_id] = []; sitesMap[s.org_id].push(s); });
    const lastEventMap: Record<string, string> = {};
    latestEvents?.forEach((e) => { if (!lastEventMap[e.org_id]) lastEventMap[e.org_id] = e.created_at; });

    return orgsData.map((org) => ({
      ...org,
      settings: settingsMap[org.id] || null,
      sites: sitesMap[org.id] || [],
      lastEvent: lastEventMap[org.id] || null,
    })).filter((org) => {
      if (searchQuery && !org.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterFocus && org.settings?.primary_focus !== filterFocus) return false;
      if (filterOnboarding === "complete" && !org.settings?.onboarding_completed) return false;
      if (filterOnboarding === "incomplete" && org.settings?.onboarding_completed) return false;
      return true;
    });
  }, [orgsData, allSettings, allSites, latestEvents, searchQuery, filterFocus, filterOnboarding]);

  const selectedOrgName = orgsData?.find((o) => o.id === selectedOrg)?.name;
  const selectedSettings = allSettings?.find((s) => s.org_id === selectedOrg);

  const exportJSON = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = (rows: any[], filename: string) => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const [activeTab, setActiveTab] = useState<"answers" | "log" | "exports">("answers");

  // Admin guard (after all hooks)
  if (!isAdmin) {
    navigate("/dashboard");
    return null;
  }

  // Detail view
  if (selectedOrg) {
    return (
      <div>
        <button onClick={() => setSelectedOrg(null)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back to Sites
        </button>
        <h1 className="text-xl font-bold text-foreground mb-1">{selectedOrgName}</h1>
        <p className="text-sm text-muted-foreground mb-6">Setup & input audit trail</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {(["answers", "log", "exports"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab === "answers" ? "Onboarding Answers" : tab === "log" ? "Change Log" : "Exports"}
            </button>
          ))}
        </div>

        {activeTab === "answers" && (
          <div className="space-y-4">
            <div className="glass-card p-5 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Primary Focus</p>
                  <p className="text-sm font-medium text-foreground">{focusLabels[selectedSettings?.primary_focus || selectedSettings?.primary_goal] || "Not set"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Onboarding</p>
                  <p className="text-sm font-medium text-foreground">{selectedSettings?.onboarding_completed ? "✅ Complete" : "⏳ Incomplete"}</p>
                </div>
              </div>
              {onboardingResponse && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Completed At</p>
                    <p className="text-sm text-foreground">{format(new Date(onboardingResponse.completed_at), "PPp")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Lead Forms</p>
                    <div className="space-y-1">
                      {(onboardingResponse.selected_forms_json as any[])?.map((f: any, i: number) => (
                        <p key={i} className="text-xs text-foreground">
                          Form {f.form_id?.slice(0, 8)}… — {f.counts_as_lead ? "✅ Lead" : "❌ Not lead"} — ${f.estimated_value || 0}
                        </p>
                      )) || <p className="text-xs text-muted-foreground">No form data</p>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Notification Prefs</p>
                    <p className="text-xs text-foreground">{JSON.stringify(onboardingResponse.notification_prefs_json)}</p>
                  </div>
                  <button
                    onClick={() => exportJSON(onboardingResponse, `onboarding-${selectedOrg}.json`)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    <Download className="h-3 w-3" /> Export JSON
                  </button>
                </>
              )}
              {!onboardingResponse && <p className="text-sm text-muted-foreground">No onboarding data recorded yet.</p>}
            </div>
          </div>
        )}

        {activeTab === "log" && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">Date/Time</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">Event Type</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">Details</th>
                    <th className="text-right py-2 text-xs font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {orgEvents?.map((evt) => (
                    <>
                      <tr key={evt.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-2 text-xs text-foreground">{format(new Date(evt.created_at), "MMM d, HH:mm")}</td>
                        <td className="py-2">
                          <span className="text-xs font-medium px-2 py-0.5 rounded bg-primary/10 text-primary">{evt.event_type}</span>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                          {JSON.stringify(evt.event_payload).slice(0, 60)}…
                        </td>
                        <td className="py-2 text-right">
                          <button onClick={() => setExpandedEvent(expandedEvent === evt.id ? null : evt.id)} className="text-xs text-primary hover:underline">
                            <Eye className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                      {expandedEvent === evt.id && (
                        <tr key={`${evt.id}-detail`}>
                          <td colSpan={4} className="p-3 bg-muted/20">
                            <pre className="text-[11px] text-foreground whitespace-pre-wrap overflow-auto max-h-40">{JSON.stringify(evt.event_payload, null, 2)}</pre>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {(!orgEvents || orgEvents.length === 0) && (
                    <tr><td colSpan={4} className="py-4 text-center text-sm text-muted-foreground">No events logged yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2">
              <button disabled={logPage === 0} onClick={() => setLogPage((p) => p - 1)} className="px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded disabled:opacity-50">Prev</button>
              <span className="text-xs text-muted-foreground">Page {logPage + 1}</span>
              <button onClick={() => setLogPage((p) => p + 1)} className="px-3 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded disabled:opacity-50" disabled={!orgEvents || orgEvents.length < LOG_PAGE_SIZE}>Next</button>
            </div>
          </div>
        )}

        {activeTab === "exports" && (
          <div className="glass-card p-5 space-y-3">
            <p className="text-sm text-muted-foreground">Download audit data for this organization.</p>
            <div className="flex gap-2">
              <button
                onClick={() => onboardingResponse && exportCSV([onboardingResponse], `onboarding-${selectedOrg}.csv`)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                disabled={!onboardingResponse}
              >
                <Download className="h-3 w-3" /> Onboarding CSV
              </button>
              <button
                onClick={() => orgEvents && exportCSV(orgEvents, `events-${selectedOrg}.csv`)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                disabled={!orgEvents || orgEvents.length === 0}
              >
                <Download className="h-3 w-3" /> Events CSV
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Sites list view
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Shield className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">Setup & Inputs</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Admin overview of all onboarding answers and user input events.</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search organizations…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select
          value={filterFocus}
          onChange={(e) => setFilterFocus(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-border rounded-lg text-foreground"
        >
          <option value="">All Focus Types</option>
          <option value="lead_volume">Lead Volume</option>
          <option value="marketing_impact">Marketing Impact</option>
          <option value="conversion_performance">Conversion Performance</option>
          <option value="paid_optimization">Paid Optimization</option>
        </select>
        <select
          value={filterOnboarding}
          onChange={(e) => setFilterOnboarding(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-border rounded-lg text-foreground"
        >
          <option value="">All Onboarding</option>
          <option value="complete">Complete</option>
          <option value="incomplete">Incomplete</option>
        </select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Organization</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Domain</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Focus</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground">Onboarded</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Last Change</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody>
            {enrichedOrgs.map((org) => (
              <tr key={org.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedOrg(org.id)}>
                <td className="px-4 py-3 font-medium text-foreground">{org.name}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{org.sites?.[0]?.domain || "—"}</td>
                <td className="px-4 py-3">
                  <span className="text-xs">{focusLabels[org.settings?.primary_focus] || "—"}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  {org.settings?.onboarding_completed ? (
                    <span className="text-xs text-success">✅</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">⏳</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                  {org.lastEvent ? format(new Date(org.lastEvent), "MMM d, HH:mm") : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-xs text-primary">View →</span>
                </td>
              </tr>
            ))}
            {enrichedOrgs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No organizations found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
