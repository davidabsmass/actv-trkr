import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import type { AcquisitionData } from "./useAcquisitionData";

export default function MetricDefinitionsPage({ data }: { data: AcquisitionData }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) return data.metrics;
    return data.metrics.filter((m) =>
      m.metric_name.toLowerCase().includes(term) ||
      m.metric_key.toLowerCase().includes(term) ||
      (m.description ?? "").toLowerCase().includes(term) ||
      (m.formula ?? "").toLowerCase().includes(term),
    );
  }, [data.metrics, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((m) => {
      const arr = map.get(m.category) ?? [];
      arr.push(m);
      map.set(m.category, arr);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Metric Definitions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Every KPI in this dashboard with its formula, source system, and caveats. A buyer must be able to trace each number.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search metrics…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {grouped.map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base capitalize">{category} ({items.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((m) => (
              <div key={m.id} className="border-l-2 border-l-primary/30 pl-3">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{m.metric_name}</h3>
                  <Badge variant="outline" className="text-[10px]">{m.metric_key}</Badge>
                  {m.unit && <Badge variant="secondary" className="text-[10px]">{m.unit}</Badge>}
                </div>
                {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
                {m.formula && (
                  <div className="text-xs mt-1">
                    <span className="text-muted-foreground">Formula: </span>
                    <code className="bg-muted px-1.5 py-0.5 rounded">{m.formula}</code>
                  </div>
                )}
                {m.source_systems && (
                  <div className="text-xs mt-1">
                    <span className="text-muted-foreground">Source: </span>
                    <span className="text-foreground">{m.source_systems}</span>
                  </div>
                )}
                {m.caveats && (
                  <div className="text-xs mt-1 text-warning">
                    <span className="font-medium">Caveat: </span>{m.caveats}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {grouped.length === 0 && (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">No metrics match your search.</CardContent></Card>
      )}
    </div>
  );
}
