import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status =
  | "opted_in"
  | "not_opted_in"
  | "not_detected"
  | "unknown"
  | "unsubscribed"
  | "suppressed"
  | "bounced"
  | "complained"
  | string
  | null
  | undefined;

const LABELS: Record<string, string> = {
  opted_in: "Opted In",
  not_opted_in: "Not Opted In",
  not_detected: "Not Detected",
  unknown: "Unknown",
  unsubscribed: "Unsubscribed",
  suppressed: "Suppressed",
  bounced: "Bounced",
  complained: "Complained",
};

export function ConsentBadge({ status, className }: { status: Status; className?: string }) {
  const key = status ?? "unknown";
  const label = LABELS[key] ?? "Unknown";

  const variantClass =
    key === "opted_in"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : key === "unsubscribed" || key === "suppressed" || key === "complained" || key === "bounced"
        ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
        : key === "not_opted_in"
          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
          : "bg-muted text-muted-foreground border-border";

  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium", variantClass, className)}>
      {label}
    </Badge>
  );
}
