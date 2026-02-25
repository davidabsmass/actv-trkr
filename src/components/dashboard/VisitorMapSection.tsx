import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Globe } from "lucide-react";

// ISO 3166-1 alpha-2 → country name mapping (top ~50 countries)
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
  XX: "Unknown",
};

interface CountryRow {
  countryCode: string;
  sessions: number;
}

interface VisitorMapSectionProps {
  data: CountryRow[];
}

function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] || code;
}

function getFlagEmoji(code: string): string {
  if (code === "XX" || code.length !== 2) return "🌐";
  const codePoints = [...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...codePoints);
}

export function VisitorMapSection({ data }: VisitorMapSectionProps) {
  if (!data || data.length === 0) return null;

  const maxSessions = data[0]?.sessions || 1;
  const totalSessions = data.reduce((s, d) => s + d.sessions, 0);

  return (
    <Card className="glass-card animate-slide-up">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Globe className="h-4 w-4 text-primary" />
          Visitor Locations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Country bars visualization */}
        <div className="space-y-2 mb-4">
          {data.slice(0, 10).map((row) => {
            const pct = (row.sessions / maxSessions) * 100;
            const sharePct = totalSessions > 0 ? ((row.sessions / totalSessions) * 100).toFixed(1) : "0";
            return (
              <div key={row.countryCode} className="flex items-center gap-3">
                <span className="text-base w-7 text-center flex-shrink-0">{getFlagEmoji(row.countryCode)}</span>
                <span className="text-sm font-medium text-foreground w-28 truncate flex-shrink-0">
                  {getCountryName(row.countryCode)}
                </span>
                <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-sm transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-16 text-right flex-shrink-0">
                  {row.sessions.toLocaleString()} ({sharePct}%)
                </span>
              </div>
            );
          })}
        </div>

        {/* Full table for all countries */}
        {data.length > 10 && (
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              Show all {data.length} countries
            </summary>
            <Table className="mt-2">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Country</TableHead>
                  <TableHead className="text-xs text-right">Sessions</TableHead>
                  <TableHead className="text-xs text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.countryCode}>
                    <TableCell className="text-sm">
                      {getFlagEmoji(row.countryCode)} {getCountryName(row.countryCode)}
                    </TableCell>
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
