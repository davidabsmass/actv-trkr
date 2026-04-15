import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, Clock,
  Wifi, WifiOff, Signal, SignalLow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { icon: any; color: string; label: string; bg: string }> = {
  active: { icon: CheckCircle2, color: "text-success", label: "Active", bg: "bg-success/10" },
  degraded: { icon: SignalLow, color: "text-warning", label: "Degraded", bg: "bg-warning/10" },
  stalled: { icon: XCircle, color: "text-destructive", label: "Stalled", bg: "bg-destructive/10" },
};

export function TrackingStatusCard({ siteId }: { siteId: string }) {
  const { orgId } = useOrg();

  const { data: status } = useQuery({
    queryKey: ["tracking_status", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_tracking_status")
        .select("*")
        .eq("site_id", siteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
    refetchInterval: 30000,
  });

  if (!status) {
    return (
      <div className="glass-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <Signal className="h-4 w-4" /> Tracker Status
        </div>
        <p className="text-sm text-muted-foreground">No tracking data received yet.</p>
      </div>
    );
  }

  const config = statusConfig[status.tracker_status] || statusConfig.active;
  const Icon = config.icon;

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" /> Tracker Health
        </div>
        <Badge variant="outline" className={`${config.color} ${config.bg} border-0`}>
          <Icon className="h-3 w-3 mr-1" />
          {config.label}
        </Badge>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Event</span>
          <span className="text-foreground">
            {status.last_event_at
              ? formatDistanceToNow(new Date(status.last_event_at), { addSuffix: true })
              : "Never"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Signal</span>
          <span className="text-foreground">
            {status.last_heartbeat_at
              ? formatDistanceToNow(new Date(status.last_heartbeat_at), { addSuffix: true })
              : "Never"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Last Pageview</span>
          <span className="text-foreground">
            {status.last_page_view_at
              ? formatDistanceToNow(new Date(status.last_page_view_at), { addSuffix: true })
              : "Never"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Events (1h)</span>
          <span className="text-foreground">{status.events_last_hour}</span>
        </div>
      </div>
    </div>
  );
}

export function TrackingAlertsPanel({ siteId }: { siteId: string }) {
  const { data: alerts } = useQuery({
    queryKey: ["tracker_alerts", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracker_alerts")
        .select("*")
        .eq("site_id", siteId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
    refetchInterval: 60000,
  });

  if (!alerts || alerts.length === 0) {
    return (
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Tracking Alerts
        </h3>
        <p className="text-xs text-muted-foreground">No tracking alerts.</p>
      </div>
    );
  }

  const severityIcon = {
    error: XCircle,
    warning: AlertTriangle,
    info: CheckCircle2,
  };

  const severityColor = {
    error: "text-destructive",
    warning: "text-warning",
    info: "text-success",
  };

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> Tracking Alerts
      </h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {alerts.map((alert) => {
          const SevIcon = severityIcon[alert.severity as keyof typeof severityIcon] || AlertTriangle;
          const color = severityColor[alert.severity as keyof typeof severityColor] || "text-muted-foreground";
          return (
            <div key={alert.id} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
              <SevIcon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(new Date(alert.created_at), "MMM d, HH:mm")}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TrackingInterruptionsTable({ siteId }: { siteId: string }) {
  const { data: interruptions } = useQuery({
    queryKey: ["tracking_interruptions", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracking_interruptions")
        .select("*")
        .eq("site_id", siteId)
        .order("started_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });

  if (!interruptions || interruptions.length === 0) {
    return (
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" /> Tracking Interruptions
        </h3>
        <p className="text-xs text-muted-foreground">No tracking interruptions recorded.</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4" /> Tracking Interruptions
      </h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {interruptions.map((int) => {
          const duration = int.duration_seconds
            ? int.duration_seconds < 60
              ? `${int.duration_seconds}s`
              : `${Math.round(int.duration_seconds / 60)}m`
            : "ongoing";
          return (
            <div key={int.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                {int.resolved ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive animate-pulse" />
                )}
                <div>
                  <p className="text-xs text-foreground">{int.trigger_reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(int.started_at), "MMM d, HH:mm")}
                    {int.ended_at && ` → ${format(new Date(int.ended_at), "HH:mm")}`}
                  </p>
                </div>
              </div>
              <Badge variant={int.resolved ? "outline" : "destructive"} className="text-xs">
                {duration}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SiteHealthBanner({ siteId }: { siteId: string }) {
  const { data: status } = useQuery({
    queryKey: ["tracking_status", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_tracking_status")
        .select("*")
        .eq("site_id", siteId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
    refetchInterval: 30000,
  });

  if (!status || status.tracker_status === "active") return null;

  const isStalled = status.tracker_status === "stalled";

  return (
    <div className={`rounded-lg p-3 flex items-center gap-3 ${
      isStalled ? "bg-destructive/10 border border-destructive/20" : "bg-warning/10 border border-warning/20"
    }`}>
      {isStalled ? (
        <WifiOff className="h-4 w-4 text-destructive flex-shrink-0" />
      ) : (
        <Wifi className="h-4 w-4 text-warning flex-shrink-0" />
      )}
      <div className="text-xs">
        <p className={`font-semibold ${isStalled ? "text-destructive" : "text-warning"}`}>
          {isStalled ? "Tracking Stalled" : "Tracking Degraded"}
        </p>
        <p className="text-muted-foreground">
          {isStalled
            ? "No tracking data has been received recently. Analytics may be incomplete."
            : "Signal is stale but some events are still flowing. Data may be partially incomplete."}
        </p>
      </div>
    </div>
  );
}
