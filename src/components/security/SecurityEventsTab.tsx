import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { format } from "date-fns";
import { Search } from "lucide-react";

type Event = {
  id: string;
  event_type: string;
  severity: string;
  message: string | null;
  metadata: Record<string, unknown>;
  user_id: string | null;
  actor_type: string;
  ip_hash: string | null;
  created_at: string;
};

const SEVERITY_VARIANT: Record<string, any> = {
  critical: "destructive",
  error: "destructive",
  warn: "secondary",
  info: "outline",
};

export function SecurityEventsTab() {
  const { orgId } = useOrg();
  const [severity, setSeverity] = useState("all");
  const [eventType, setEventType] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Event | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["security_events_log", orgId, severity, eventType, search],
    queryFn: async (): Promise<Event[]> => {
      if (!orgId) return [];
      let q = supabase
        .from("security_audit_log")
        .select("id, event_type, severity, message, metadata, user_id, actor_type, ip_hash, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (severity !== "all") q = q.eq("severity", severity);
      if (eventType !== "all") q = q.eq("event_type", eventType);
      if (search) q = q.or(`event_type.ilike.%${search}%,message.ilike.%${search}%`);
      const { data, error } = await q.limit(300);
      if (error) throw error;
      return (data ?? []) as Event[];
    },
    enabled: !!orgId,
  });

  const { data: types } = useQuery({
    queryKey: ["security_event_types", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("security_audit_log")
        .select("event_type")
        .eq("org_id", orgId)
        .limit(500);
      const set = new Set<string>();
      (data ?? []).forEach((r: any) => set.add(r.event_type));
      return Array.from(set).sort();
    },
    enabled: !!orgId,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search events…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All event types</SelectItem>
              {(types ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">No events recorded yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((e) => (
                  <TableRow key={e.id} className="cursor-pointer" onClick={() => setSelected(e)}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(e.created_at), "MMM d, HH:mm")}</TableCell>
                    <TableCell><Badge variant={SEVERITY_VARIANT[e.severity] ?? "outline"} className="text-xs uppercase">{e.severity}</Badge></TableCell>
                    <TableCell className="text-sm font-medium">{e.event_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-md truncate">{e.message ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.actor_type}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">View</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={SEVERITY_VARIANT[selected.severity] ?? "outline"} className="uppercase text-xs">{selected.severity}</Badge>
                  <Badge variant="outline" className="text-xs">{selected.actor_type}</Badge>
                </div>
                <SheetTitle className="text-left">{selected.event_type}</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-4 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Time</div>
                  <div>{format(new Date(selected.created_at), "PPpp")}</div>
                </div>
                {selected.message && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Message</div>
                    <div>{selected.message}</div>
                  </div>
                )}
                {selected.ip_hash && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">IP (hashed)</div>
                    <div className="font-mono text-xs">{selected.ip_hash}</div>
                  </div>
                )}
                {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Metadata</div>
                    <pre className="bg-muted/50 rounded p-2 text-xs overflow-x-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
