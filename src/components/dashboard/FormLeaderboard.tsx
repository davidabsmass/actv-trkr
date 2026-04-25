import { useMemo, useState } from "react";
import { FileText, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

interface DeviceData {
  [formId: string]: { desktop: number; mobile: number; tablet: number };
}

interface FormStat {
  name: string;
  submissions: number;
  sessions: number;
  cvr: number;
  deviceSplit?: { desktop: number; mobile: number } | null;
}

interface FormLeaderboardProps {
  forms: Array<{ id: string; name: string; estimated_value?: number; archived?: boolean; is_active?: boolean }>;
  leads: Array<{ form_id: string; submitted_at: string; source?: string | null; session_id?: string | null }>;
  sessions: number;
  deviceData?: DeviceData;
  leadCounts?: Record<string, number>;
}

type SortKey = "submissions" | "desktop" | "mobile";
type SortDir = "asc" | "desc";

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return dir === "desc"
    ? <ChevronDown className="h-3 w-3 text-primary" />
    : <ChevronUp className="h-3 w-3 text-primary" />;
}

export function FormLeaderboard({ forms, leads, sessions, deviceData, leadCounts }: FormLeaderboardProps) {
  const { t } = useTranslation();
  const [sortKey, setSortKey] = useState<SortKey>("submissions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const stats = useMemo(() => {
    const formMap: Record<string, FormStat> = {};
    const activeForms = forms.filter((f) => !f.archived && f.is_active !== false);
    activeForms.forEach((f) => {
      let deviceSplit: { desktop: number; mobile: number } | null = null;
      if (deviceData && deviceData[f.id]) {
        const d = deviceData[f.id];
        const total = d.desktop + d.mobile + d.tablet;
        if (total > 0) {
          deviceSplit = {
            desktop: Math.round(((d.desktop + d.tablet) / total) * 100),
            mobile: Math.round((d.mobile / total) * 100),
          };
        }
      }

      formMap[f.id] = {
        name: f.name,
        submissions: 0,
        sessions,
        cvr: 0,
        deviceSplit,
      };
    });

    leads.forEach((l) => {
      if (formMap[l.form_id]) {
        formMap[l.form_id].submissions++;
      }
    });

    // Override with deduplicated leadCounts if available
    if (leadCounts) {
      Object.entries(formMap).forEach(([formId, stat]) => {
        if (leadCounts[formId] !== undefined) {
          stat.submissions = leadCounts[formId];
        }
      });
    }

    // Compute CVR
    Object.values(formMap).forEach((s) => {
      s.cvr = s.sessions > 0 ? (s.submissions / s.sessions) * 100 : 0;
    });

    const arr = Object.values(formMap);

    arr.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "submissions": av = a.submissions; bv = b.submissions; break;
        case "desktop": av = a.deviceSplit?.desktop ?? -1; bv = b.deviceSplit?.desktop ?? -1; break;
        case "mobile": av = a.deviceSplit?.mobile ?? -1; bv = b.deviceSplit?.mobile ?? -1; break;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return arr;
  }, [forms, leads, sessions, deviceData, leadCounts, sortKey, sortDir]);

  if (stats.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
    <div className="glass-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        {t("dashboard.formLeaderboard")}
      </h3>
      <p className="text-xs text-muted-foreground mb-4">{t("dashboard.formLeaderboardSub")}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-xs font-medium text-muted-foreground">{t("dashboard.form")}</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("submissions")}>
                <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.submissions")} <SortIcon active={sortKey === "submissions"} dir={sortDir} /></span>
              </th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("desktop")}>
                <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.desktop")} <SortIcon active={sortKey === "desktop"} dir={sortDir} /></span>
              </th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("mobile")}>
                <span className="inline-flex items-center gap-1 justify-end">{t("dashboard.mobile")} <SortIcon active={sortKey === "mobile"} dir={sortDir} /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                <td className="py-2.5 font-medium text-foreground">{s.name}</td>
                <td className="py-2.5 text-right font-mono-data">{s.submissions}</td>
                <td className="py-2.5 text-right font-mono-data text-muted-foreground hidden sm:table-cell">
                  {s.deviceSplit ? `${s.deviceSplit.desktop}%` : "—"}
                </td>
                <td className="py-2.5 text-right font-mono-data text-muted-foreground hidden sm:table-cell">
                  {s.deviceSplit ? `${s.deviceSplit.mobile}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </TooltipProvider>
  );
}
