import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Globe } from "lucide-react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { useMemo } from "react";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ISO 3166-1 alpha-2 → ISO 3166-1 numeric mapping for TopoJSON join
const ALPHA2_TO_NUMERIC: Record<string, string> = {
  US: "840", GB: "826", CA: "124", AU: "036", DE: "276", FR: "250", IN: "356",
  BR: "076", JP: "392", MX: "484", IT: "380", ES: "724", NL: "528", KR: "410",
  SE: "752", NO: "578", DK: "208", FI: "246", PL: "616", AT: "040", CH: "756",
  BE: "056", PT: "620", IE: "372", NZ: "554", SG: "702", HK: "344", TW: "158",
  PH: "608", TH: "764", ID: "360", MY: "458", VN: "704", ZA: "710", NG: "566",
  EG: "818", KE: "404", AR: "032", CL: "152", CO: "170", PE: "604", RU: "643",
  UA: "804", TR: "792", SA: "682", AE: "784", IL: "376", CZ: "203", RO: "642",
  HU: "348", GR: "300", CN: "156",
};

// ISO 3166-1 alpha-2 → country name mapping
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
  const maxSessions = data?.[0]?.sessions || 1;
  const totalSessions = data?.reduce((s, d) => s + d.sessions, 0) || 0;

  // Build a numeric-id → session count lookup for the map
  const numericMap = useMemo(() => {
    const m: Record<string, number> = {};
    data.forEach((row) => {
      const numId = ALPHA2_TO_NUMERIC[row.countryCode];
      if (numId) m[numId] = row.sessions;
    });
    return m;
  }, [data]);

  if (!data || data.length === 0) return null;

  const getColor = (numericId: string) => {
    const count = numericMap[numericId];
    if (!count) return "hsl(var(--muted) / 0.3)";
    const intensity = Math.min(count / maxSessions, 1);
    // Scale opacity from 0.2 to 1 based on session intensity
    const opacity = 0.2 + intensity * 0.8;
    return `hsl(var(--primary) / ${opacity.toFixed(2)})`;
  };

  return (
    <Card className="glass-card animate-slide-up">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Globe className="h-4 w-4 text-primary" />
          Visitor Locations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* World Map */}
        <div className="rounded-lg overflow-hidden bg-muted/20 mb-4 border border-border/50">
          <ComposableMap
            projectionConfig={{ rotate: [-10, 0, 0], scale: 147 }}
            height={320}
            style={{ width: "100%", height: "auto" }}
          >
            <ZoomableGroup>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const numId = geo.id;
                    const fillColor = getColor(numId);
                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fillColor}
                        stroke="hsl(var(--border))"
                        strokeWidth={0.4}
                        style={{
                          default: { outline: "none" },
                          hover: { outline: "none", fill: "hsl(var(--primary))", cursor: "pointer" },
                          pressed: { outline: "none" },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
        </div>

        {/* Country bars */}
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
