// Shared utilities for the Acquisition Readiness dashboard.

export const fmtCurrency = (n: number | null | undefined, opts: { compact?: boolean } = {}): string => {
  if (n == null || Number.isNaN(n)) return "—";
  if (opts.compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(n);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
};

export const fmtPct = (n: number | null | undefined, digits = 1): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}%`;
};

export const fmtNumber = (n: number | null | undefined, digits = 0): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);
};

export const fmtRatio = (n: number | null | undefined, digits = 2): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(digits)}×`;
};

export const fmtMonths = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)} mo`;
};

export const monthKey = (d: Date): string => {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export const lastNMonths = (n: number): string[] => {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(monthKey(d));
  }
  return out;
};

export const monthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

export const severityTone = (sev: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (sev) {
    case "critical": return "destructive";
    case "high": return "destructive";
    case "medium": return "default";
    case "low": return "secondary";
    default: return "outline";
  }
};

export const readinessTone = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "ready": return "default";
    case "partial": return "secondary";
    case "missing": return "destructive";
    default: return "outline";
  }
};
