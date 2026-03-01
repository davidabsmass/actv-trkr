import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Globe } from "lucide-react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { useMemo, useState } from "react";

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

// Reverse: numeric → alpha-2 for tooltip lookups
const NUMERIC_TO_ALPHA2: Record<string, string> = {};
Object.entries(ALPHA2_TO_NUMERIC).forEach(([a2, num]) => { NUMERIC_TO_ALPHA2[num] = a2; });

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

// Heat map color stops: white → light grey → medium grey → dark grey → near black
const HEAT_COLORS = [
  { stop: 0,    color: "#E5E7EB" }, // gray-200
  { stop: 0.25, color: "#9CA3AF" }, // gray-400
  { stop: 0.5,  color: "#6B7280" }, // gray-500
  { stop: 0.75, color: "#4B5563" }, // gray-600
  { stop: 1,    color: "#1F2937" }, // gray-800
];

function getHeatColor(intensity: number): string {
  const t = Math.max(0, Math.min(1, intensity));
  // Find the two stops we're between
  for (let i = 0; i < HEAT_COLORS.length - 1; i++) {
    const lo = HEAT_COLORS[i];
    const hi = HEAT_COLORS[i + 1];
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
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

interface TooltipInfo {
  name: string;
  sessions: number;
  x: number;
  y: number;
}

export function VisitorMapSection({ data }: VisitorMapSectionProps) {
  const maxSessions = data?.[0]?.sessions || 1;
  const totalSessions = data?.reduce((s, d) => s + d.sessions, 0) || 0;
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  // Build numeric-id → session count lookup
  const numericMap = useMemo(() => {
    const m: Record<string, number> = {};
    data.forEach((row) => {
      const numId = ALPHA2_TO_NUMERIC[row.countryCode];
      if (numId) m[numId] = row.sessions;
    });
    return m;
  }, [data]);

  const hasData = data && data.length > 0;

  const getColor = (numericId: string) => {
    const count = numericMap[numericId];
    if (!count) return "#F3F4F6"; // gray-100 for no-data countries
    const intensity = Math.min(count / maxSessions, 1);
    return getHeatColor(intensity);
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
        <div
          className="rounded-lg overflow-hidden bg-white mb-4 border border-border/50 relative"
          onMouseLeave={() => setTooltip(null)}
        >
          <ComposableMap
            projectionConfig={{ rotate: [-10, 0, 0], scale: 220 }}
            height={500}
            style={{ width: "100%", height: "auto" }}
          >
            <ZoomableGroup>
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo) => {
                    const numId = geo.id;
                    const fillColor = getColor(numId);
                    const count = numericMap[numId] || 0;
                    const alpha2 = NUMERIC_TO_ALPHA2[numId];
                    const name = alpha2 ? getCountryName(alpha2) : geo.properties?.name || "Unknown";

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={fillColor}
                        stroke="#D1D5DB"
                        strokeWidth={0.4}
                        onMouseEnter={(e) => {
                          const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                          if (rect) {
                            setTooltip({
                              name,
                              sessions: count,
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                            });
                          }
                        }}
                        onMouseMove={(e) => {
                          const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                          if (rect) {
                            setTooltip({
                              name,
                              sessions: count,
                              x: e.clientX - rect.left,
                              y: e.clientY - rect.top,
                            });
                          }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          default: { outline: "none" },
                          hover: { outline: "none", fill: count > 0 ? getHeatColor(1) : "#E5E7EB", cursor: "pointer" },
                          pressed: { outline: "none" },
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute pointer-events-none z-50 px-3 py-1.5 rounded-md bg-popover border border-border shadow-lg text-sm text-popover-foreground"
              style={{
                left: tooltip.x + 12,
                top: tooltip.y - 10,
                transform: "translateY(-100%)",
              }}
            >
              <span className="font-semibold">{tooltip.name}</span>
              {tooltip.sessions > 0 && (
                <span className="ml-2 text-muted-foreground">
                  {tooltip.sessions.toLocaleString()} session{tooltip.sessions !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Heat map legend */}
        <div className="flex items-center gap-2 mb-4 px-1">
          <span className="text-xs text-muted-foreground">Low</span>
          <div
            className="flex-1 h-2 rounded-full"
            style={{
              background: `linear-gradient(to right, ${HEAT_COLORS.map(c => c.color).join(", ")})`,
            }}
          />
          <span className="text-xs text-muted-foreground">High</span>
        </div>

        {/* Country bars */}
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
                  <span className="text-sm font-medium text-foreground w-28 truncate flex-shrink-0">
                    {getCountryName(row.countryCode)}
                  </span>
                  <div className="flex-1 h-5 bg-muted/50 rounded-sm overflow-hidden">
                    <div
                      className="h-full rounded-sm transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-16 text-right flex-shrink-0">
                    {row.sessions.toLocaleString()} ({sharePct}%)
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No geographic data yet. Country data will appear automatically as new pageviews arrive with location info.
          </p>
        )}

        {/* Full table for all countries */}
        {hasData && data.length > 10 && (
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
