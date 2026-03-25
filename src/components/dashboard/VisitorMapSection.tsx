import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Globe } from "lucide-react";

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia", DE: "Germany",
  FR: "France", IN: "India", BR: "Brazil", JP: "Japan", MX: "Mexico", IT: "Italy",
  ES: "Spain", NL: "Netherlands", KR: "South Korea", SE: "Sweden", NO: "Norway",
  DK: "Denmark", FI: "Finland", PL: "Poland", AT: "Austria", CH: "Switzerland",
  BE: "Belgium", PT: "Portugal", IE: "Ireland", NZ: "New Zealand", SG: "Singapore",
  HK: "Hong Kong", TW: "Taiwan", PH: "Philippines", TH: "Thailand", ID: "Indonesia",
  MY: "Malaysia", VN: "Vietnam", ZA: "South Africa", NG: "Nigeria", EG: "Egypt",
  KE: "Kenya", AR: "Argentina", CL: "Chile", CO: "Colombia", PE: "Peru",
  RU: "Russia", UA: "Ukraine", TR: "Turkey", SA: "Saudi Arabia", AE: "UAE",
  IL: "Israel", CZ: "Czech Republic", RO: "Romania", HU: "Hungary", GR: "Greece",
  CN: "China", XX: "Unknown",
};

interface CountryRow { countryCode: string; sessions: number; }
interface VisitorMapSectionProps { data: CountryRow[]; }

function getCountryName(code: string): string { return COUNTRY_NAMES[code] || code; }

function getFlagEmoji(code: string): string {
  if (code === "XX" || code.length !== 2) return "🌐";
  const codePoints = [...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

const HEAT_COLORS = [
  { stop: 0, color: "#E5E7EB" }, { stop: 0.25, color: "#9CA3AF" },
  { stop: 0.5, color: "#6B7280" }, { stop: 0.75, color: "#4B5563" }, { stop: 1, color: "#1F2937" },
];

function getHeatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  for (let i = 0; i < HEAT_COLORS.length - 1; i++) {
    const lo = HEAT_COLORS[i], hi = HEAT_COLORS[i + 1];
    if (t >= lo.stop && t <= hi.stop) {
      const localT = (t - lo.stop) / (hi.stop - lo.stop);
      return interpolateHex(lo.color, hi.color, localT);
    }
  }
  return HEAT_COLORS[HEAT_COLORS.length - 1].color;
}

function interpolateHex(c1: string, c2: string, t: number): string {
  const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t), g = Math.round(g1 + (g2 - g1) * t), b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function VisitorMapSection({ data }: VisitorMapSectionProps) {
  const { t } = useTranslation();
  const maxSessions = data?.[0]?.sessions || 1;
  const totalSessions = data?.reduce((s, d) => s + d.sessions, 0) || 0;
  const hasData = data && data.length > 0;

  return (
    <Card className="glass-card animate-slide-up">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Globe className="h-4 w-4 text-primary" />
          {t("visitorMap.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4 px-1">
          <span className="text-xs text-muted-foreground">{t("visitorMap.low")}</span>
          <div className="flex-1 h-2 rounded-full" style={{ background: `linear-gradient(to right, ${HEAT_COLORS.map(c => c.color).join(", ")})` }} />
          <span className="text-xs text-muted-foreground">{t("visitorMap.high")}</span>
        </div>

        {hasData ? (
          <div className="space-y-2 mb-4">
            {data.slice(0, 10).map((row) => {
              const pct = (row.sessions / maxSessions) * 100;
              const sharePct = totalSessions > 0 ? ((row.sessions / totalSessions) * 100).toFixed(1) : "0";
              const intensity = Math.min(row.sessions / maxSessions, 1);
              const barColor = getHeatColor(intensity);
              return (
                <div key={row.countryCode} className="flex items-center gap-3">
                  <span className="text-base w-7 text-center flex-shrink-0">{getFlagEmoji(row.countryCode)}</span>
                  <span className="text-sm font-medium text-foreground w-28 truncate flex-shrink-0">{getCountryName(row.countryCode)}</span>
                  <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
                    <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right flex-shrink-0">
                    {row.sessions.toLocaleString()} ({sharePct}%)
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">{t("visitorMap.noData")}</p>
        )}

        {hasData && data.length > 10 && (
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              {t("visitorMap.showAll", { count: data.length })}
            </summary>
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("visitorMap.country")}</TableHead>
                  <TableHead className="text-xs text-right">{t("visitorMap.sessions")}</TableHead>
                  <TableHead className="text-xs text-right">{t("visitorMap.share")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.countryCode}>
                    <TableCell className="text-sm">{getFlagEmoji(row.countryCode)} {getCountryName(row.countryCode)}</TableCell>
                    <TableCell className="text-sm text-right">{row.sessions.toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right text-muted-foreground">
                      {totalSessions > 0 ? ((row.sessions / totalSessions) * 100).toFixed(1) : "0"}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
