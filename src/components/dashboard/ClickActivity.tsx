import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MousePointerClick, Download, ExternalLink, Phone, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

interface ClickMetric {
  type: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  topTargets: { text: string; count: number }[];
}

export function ClickActivity({ orgId, startDate, endDate }: { orgId: string | null; startDate: string; endDate: string }) {
  const { t } = useTranslation();
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const typeConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    cta_click: { label: t("dashboard.ctaClicks"), icon: <MousePointerClick className="h-3.5 w-3.5 text-primary" /> },
    download_click: { label: t("dashboard.downloads"), icon: <Download className="h-3.5 w-3.5 text-info" /> },
    outbound_click: { label: t("dashboard.outboundLinks"), icon: <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> },
    tel_click: { label: t("dashboard.phoneClicks"), icon: <Phone className="h-3.5 w-3.5 text-success" /> },
    mailto_click: { label: t("dashboard.emailClicks"), icon: <Mail className="h-3.5 w-3.5 text-warning" /> },
  };

  const { data: clickData, isLoading } = useQuery({
    queryKey: ["click_activity", orgId, startDate, endDate],
    queryFn: async () => {
      if (!orgId) return [];
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      const { data: events } = await supabase
        .from("events")
        .select("event_type, target_text")
        .eq("org_id", orgId)
        .gte("occurred_at", dayStart).lte("occurred_at", dayEnd)
        .limit(1000);

      if (!events || events.length === 0) return [];

      const typeMap: Record<string, { count: number; targets: Record<string, number> }> = {};
      events.forEach(evt => {
        if (!typeMap[evt.event_type]) typeMap[evt.event_type] = { count: 0, targets: {} };
        typeMap[evt.event_type].count++;
        const text = evt.target_text || "(unknown)";
        typeMap[evt.event_type].targets[text] = (typeMap[evt.event_type].targets[text] || 0) + 1;
      });

      return Object.entries(typeMap)
        .filter(([type]) => typeConfig[type])
        .map(([type, data]): ClickMetric => ({
          type,
          label: typeConfig[type].label,
          count: data.count,
          icon: typeConfig[type].icon,
          topTargets: Object.entries(data.targets)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([text, count]) => ({ text, count })),
        }))
        .sort((a, b) => b.count - a.count);
    },
    enabled: !!orgId,
  });

  const { data: drillData, isLoading: drillLoading } = useQuery({
    queryKey: ["click_drill", orgId, startDate, endDate, selectedType],
    queryFn: async () => {
      if (!orgId || !selectedType) return [];
      const dayStart = `${startDate}T00:00:00Z`;
      const dayEnd = `${endDate}T23:59:59.999Z`;

      const { data } = await supabase
        .from("events")
        .select("occurred_at, target_text, page_url, page_path, session_id, meta")
        .eq("org_id", orgId)
        .eq("event_type", selectedType)
        .gte("occurred_at", dayStart).lte("occurred_at", dayEnd)
        .order("occurred_at", { ascending: false })
        .limit(200);

      return data || [];
    },
    enabled: !!orgId && !!selectedType,
  });

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="h-20 bg-muted rounded" />
      </div>
    );
  }

  if (!clickData || clickData.length === 0) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">{t("dashboard.clickActivity")}</h3>
        <p className="text-xs text-muted-foreground text-center py-6">{t("dashboard.clickDataPending")}</p>
      </div>
    );
  }

  const totalClicks = clickData.reduce((s, c) => s + c.count, 0);
  const selectedLabel = selectedType ? typeConfig[selectedType]?.label : "";

  return (
    <>
      <div className="glass-card p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-primary" />
            {t("dashboard.clickActivity")}
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono-data text-muted-foreground">{totalClicks} {t("dashboard.total")}</span>
            <IconTooltip label="Breakdown of visitor clicks — buttons, links, phone calls, and other interactions.">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </IconTooltip>
          </div>
        </div>

        <div className="space-y-4">
          {clickData.map((metric) => (
            <div
              key={metric.type}
              className="cursor-pointer rounded-md p-1.5 -mx-1.5 transition-colors hover:bg-muted/50"
              onClick={() => setSelectedType(metric.type)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setSelectedType(metric.type)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {metric.icon}
                  <span className="text-sm font-medium text-foreground">{metric.label}</span>
                </div>
                <span className="text-sm font-mono-data font-bold text-foreground">{metric.count}</span>
              </div>
              {metric.topTargets.length > 0 && (
                <div className="pl-6 space-y-1">
                  {metric.topTargets.map((tgt, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground truncate max-w-[70%]">{tgt.text}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary/50" style={{ width: `${(tgt.count / metric.count) * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono-data text-muted-foreground w-6 text-right">{tgt.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!selectedType} onOpenChange={(open) => !open && setSelectedType(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedType && typeConfig[selectedType]?.icon}
              {selectedLabel} — {t("clickDrill.eventLog")}
            </DialogTitle>
            <DialogDescription>
              {t("clickDrill.eventsFrom", { start: startDate, end: endDate })}
            </DialogDescription>
          </DialogHeader>

          {drillLoading ? (
            <div className="space-y-2 py-4">
              {[1, 2, 3].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
            </div>
          ) : !drillData || drillData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">{t("clickDrill.noEvents")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                   <TableHead>{t("clickDrill.timestamp")}</TableHead>
                   <TableHead>{t("clickDrill.target")}</TableHead>
                   <TableHead>{t("goals.title")}</TableHead>
                   <TableHead>{t("clickDrill.pagePath")}</TableHead>
                   <TableHead className="w-[100px]">{t("clickDrill.session")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drillData.map((evt: any, i: number) => {
                  const label = evt.meta?.target_label || "";
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono-data whitespace-nowrap">
                        {format(new Date(evt.occurred_at), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[180px]" title={evt.target_text || ""}>{evt.target_text || "—"}</TableCell>
                      <TableCell className="text-xs truncate max-w-[120px] text-muted-foreground" title={label}>{label || "—"}</TableCell>
                      <TableCell className="text-xs truncate max-w-[200px]" title={evt.page_path || evt.page_url || ""}>{evt.page_path || evt.page_url || "—"}</TableCell>
                      <TableCell className="text-xs font-mono-data text-muted-foreground truncate max-w-[100px]" title={evt.session_id || ""}>
                        {evt.session_id ? evt.session_id.slice(0, 8) + "…" : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
