import { useMemo } from "react";
import { FileText } from "lucide-react";

interface DeviceData {
  [formId: string]: { desktop: number; mobile: number; tablet: number };
}

interface FormStat {
  name: string;
  submissions: number;
  sessions: number;
  deviceSplit?: { desktop: number; mobile: number } | null;
}

interface FormLeaderboardProps {
  forms: Array<{ id: string; name: string; estimated_value?: number; archived?: boolean }>;
  leads: Array<{ form_id: string; submitted_at: string; source?: string | null; session_id?: string | null }>;
  sessions: number;
  deviceData?: DeviceData;
}

export function FormLeaderboard({ forms, leads, sessions, deviceData }: FormLeaderboardProps) {
  const stats = useMemo(() => {
    const formMap: Record<string, FormStat> = {};
    const activeForms = forms.filter((f) => !f.archived);
    activeForms.forEach((f) => {
      // Compute device split from real data if available
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
        deviceSplit,
      };
    });

    leads.forEach((l) => {
      if (formMap[l.form_id]) {
        formMap[l.form_id].submissions++;
      }
    });

    return Object.values(formMap)
      .sort((a, b) => b.submissions - a.submissions);
  }, [forms, leads, sessions, deviceData]);

  if (stats.length === 0) {
    return null;
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        Form Performance Leaderboard
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-xs font-medium text-muted-foreground">Form</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground">Submissions</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground">Conv %</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Desktop</th>
              <th className="text-right py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Mobile</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const cvr = s.sessions > 0 ? (s.submissions / s.sessions) * 100 : 0;
              return (
                <tr key={s.name} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 font-medium text-foreground">{s.name}</td>
                  <td className="py-2.5 text-right font-mono-data">{s.submissions}</td>
                  <td className="py-2.5 text-right font-mono-data">{cvr.toFixed(1)}%</td>
                  <td className="py-2.5 text-right font-mono-data text-muted-foreground hidden sm:table-cell">
                    {s.deviceSplit ? `${s.deviceSplit.desktop}%` : "—"}
                  </td>
                  <td className="py-2.5 text-right font-mono-data text-muted-foreground hidden sm:table-cell">
                    {s.deviceSplit ? `${s.deviceSplit.mobile}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
