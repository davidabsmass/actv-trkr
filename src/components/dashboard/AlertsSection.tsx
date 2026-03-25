import { AlertTriangle, Info, AlertCircle } from "lucide-react";

interface Alert {
  id: string;
  severity: "warning" | "info" | "error";
  title: string;
  detail: string;
  date: string;
}

interface AlertsProps {
  alerts: Alert[];
}

const severityConfig = {
  error: {
    icon: AlertCircle,
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    iconColor: "text-destructive",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-warning/10",
    border: "border-warning/20",
    iconColor: "text-warning",
  },
  info: {
    icon: Info,
    bg: "bg-primary/10",
    border: "border-primary/20",
    iconColor: "text-primary",
  },
};

export function AlertsSection({ alerts }: AlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="glass-card p-5 animate-slide-up">
      <h3 className="text-sm font-semibold text-foreground mb-4">Alerts & Anomalies</h3>
      <div className="space-y-2">
        {alerts.map((alert) => {
          const config = severityConfig[alert.severity];
          const Icon = config.icon;
          return (
            <div
              key={alert.id}
              className={`flex items-start gap-3 p-3 rounded-lg border ${config.bg} ${config.border}`}
            >
              <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-foreground">{alert.title}</p>
                  <span className="text-xs text-muted-foreground">{alert.date}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
