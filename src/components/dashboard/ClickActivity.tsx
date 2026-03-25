import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MousePointerClick, Download, ExternalLink, Phone, Mail } from "lucide-react";

interface ClickMetric {
  type: string;
  label: string;
  count: number;
  icon: React.ReactNode;
  topTargets: { text: string; count: number }[];
}

const typeConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  cta_click: { label: "CTA Clicks", icon: <MousePointerClick className="h-3.5 w-3.5 text-primary" /> },
  download_click: { label: "Downloads", icon: <Download className="h-3.5 w-3.5 text-info" /> },
  outbound_click: { label: "Outbound Links", icon: <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> },
  tel_click: { label: "Phone Clicks", icon: <Phone className="h-3.5 w-3.5 text-success" /> },
  mailto_click: { label: "Email Clicks", icon: <Mail className="h-3.5 w-3.5 text-warning" /> },
};

export function ClickActivity({ orgId, startDate, endDate }: { orgId: string | null; startDate: string; endDate: string }) {
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

      // Group by event_type
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
        <h3 className="text-sm font-semibold text-foreground mb-3">Click Activity</h3>
        <p className="text-xs text-muted-foreground text-center py-6">
          Click data will appear once behavioral tracking is active.
        </p>
      </div>
    );
  }

  const totalClicks = clickData.reduce((s, c) => s + c.count, 0);

  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-primary" />
          Click Activity
        </h3>
        <span className="text-xs font-mono-data text-muted-foreground">{totalClicks} total</span>
      </div>

      <div className="space-y-4">
        {clickData.map((metric) => (
          <div key={metric.type}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                {metric.icon}
                <span className="text-sm font-medium text-foreground">{metric.label}</span>
              </div>
              <span className="text-sm font-mono-data font-bold text-foreground">{metric.count}</span>
            </div>
            {metric.topTargets.length > 0 && (
              <div className="pl-6 space-y-1">
                {metric.topTargets.map((t, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate max-w-[70%]">{t.text}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary/50"
                          style={{ width: `${(t.count / metric.count) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono-data text-muted-foreground w-6 text-right">{t.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
