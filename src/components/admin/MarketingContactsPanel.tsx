import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Download, Upload, Loader2, ShieldOff, Ban } from "lucide-react";
import { ConsentBadge } from "@/components/contacts/ConsentBadge";
import { downloadCsv } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

type Row = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  source: string;
  lifecycle_stage: string;
  marketing_consent_status: string;
  marketing_consent_source: string | null;
  marketing_consent_text: string | null;
  marketing_consent_timestamp: string | null;
  marketing_consent_url: string | null;
  consent_ip_hash: string | null;
  unsubscribed_at: string | null;
  created_at: string;
};

const CONSENT_OPTIONS = ["all", "opted_in", "not_opted_in", "unsubscribed", "suppressed", "unknown"];
const LIFECYCLE_OPTIONS = ["all", "prospect", "trial_user", "subscriber", "team_user", "churned", "suppressed"];
const SOURCE_OPTIONS = ["all", "signup", "trial", "early_access", "demo_request", "manual_import", "team_invite", "report_subscribe_link", "other"];

export default function MarketingContactsPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [consentFilter, setConsentFilter] = useState("all");
  const [lifecycleFilter, setLifecycleFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [details, setDetails] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["marketing_contacts", consentFilter, lifecycleFilter, sourceFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("marketing_contacts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (consentFilter !== "all") q = q.eq("marketing_consent_status", consentFilter as any);
      if (lifecycleFilter !== "all") q = q.eq("lifecycle_stage", lifecycleFilter as any);
      if (sourceFilter !== "all") q = q.eq("source", sourceFilter as any);
      if (search) q = q.ilike("email_lower", `%${search.toLowerCase()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as Row[];
    },
  });

  const rows = data ?? [];

  const stats = useMemo(() => {
    const counts = { opted_in: 0, not_opted_in: 0, unsubscribed: 0, suppressed: 0, unknown: 0 };
    for (const r of rows) {
      const k = (r.marketing_consent_status as keyof typeof counts) || "unknown";
      if (k in counts) counts[k] += 1;
    }
    return counts;
  }, [rows]);

  const handleExport = async () => {
    const optedIn = rows.filter((r) => r.marketing_consent_status === "opted_in");
    if (!optedIn.length) {
      toast({ title: "No opted-in contacts to export" });
      return;
    }
    const exportRows = optedIn.map((r) => ({
      email: r.email,
      first_name: r.first_name ?? "",
      last_name: r.last_name ?? "",
      company_name: r.company_name ?? "",
      source: r.source,
      lifecycle_stage: r.lifecycle_stage,
      marketing_consent_source: r.marketing_consent_source ?? "",
      marketing_consent_timestamp: r.marketing_consent_timestamp ?? "",
      marketing_consent_url: r.marketing_consent_url ?? "",
    }));
    downloadCsv(`actv-trkr-marketing-opted-in-${new Date().toISOString().slice(0, 10)}.csv`, exportRows);

    // Audit log
    await supabase.from("marketing_contact_events").insert({
      event_type: "export",
      actor_user_id: user?.id,
      actor_type: "admin",
      metadata: { row_count: exportRows.length, scope: "opted_in" },
    } as any);
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { marketing_consent_status: status };
      if (status === "unsubscribed") patch.unsubscribed_at = new Date().toISOString();
      if (status === "suppressed") patch.lifecycle_stage = "suppressed";
      const { error } = await supabase
        .from("marketing_contacts")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
      await supabase.from("marketing_contact_events").insert({
        contact_id: id,
        event_type: status === "unsubscribed" ? "unsubscribe" : status === "suppressed" ? "suppress" : "status_change",
        actor_user_id: user?.id,
        actor_type: "admin",
        metadata: { new_status: status },
      } as any);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing_contacts"] });
      toast({ title: "Updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ACTV TRKR Marketing Contacts</CardTitle>
          <CardDescription>
            Our own subscribers, prospects, and opted-in marketing contacts. Site contacts captured
            from customer websites are <strong>never</strong> included here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email…"
                className="pl-8 h-9 w-56"
              />
            </div>
            <Select value={consentFilter} onValueChange={setConsentFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONSENT_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All consent" : s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LIFECYCLE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All stages" : s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All sources" : s}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" size="sm" disabled className="gap-1.5">
                      <Upload className="h-3.5 w-3.5" />
                      Sync to Mailchimp / Brevo / Loops
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Coming soon</TooltipContent>
              </Tooltip>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Export opted-in CSV
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Export opted-in ACTV TRKR marketing contacts</AlertDialogTitle>
                    <AlertDialogDescription>
                      This export includes only contacts with consent status <strong>opted_in</strong>.
                      Site leads, form submissions, report recipients, and customer-owned contacts
                      are never included.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExport}>Export CSV</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <Stat label="Opted In" value={stats.opted_in} />
            <Stat label="Not Opted In" value={stats.not_opted_in} />
            <Stat label="Unsubscribed" value={stats.unsubscribed} />
            <Stat label="Suppressed" value={stats.suppressed} />
            <Stat label="Unknown" value={stats.unknown} />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No marketing contacts match these filters yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Consent</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-sm">{r.email}</TableCell>
                      <TableCell className="text-sm">
                        {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.lifecycle_stage}</TableCell>
                      <TableCell><ConsentBadge status={r.marketing_consent_status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDetails(r)}>
                            View consent
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs gap-1"
                            disabled={updateStatus.isPending || r.marketing_consent_status === "unsubscribed"}
                            onClick={() => updateStatus.mutate({ id: r.id, status: "unsubscribed" })}
                          >
                            <Ban className="h-3 w-3" /> Unsubscribe
                          </Button>
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs gap-1"
                            disabled={updateStatus.isPending || r.marketing_consent_status === "suppressed"}
                            onClick={() => updateStatus.mutate({ id: r.id, status: "suppressed" })}
                          >
                            <ShieldOff className="h-3 w-3" /> Suppress
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!details} onOpenChange={(v) => !v && setDetails(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Consent details</SheetTitle>
            <SheetDescription>{details?.email}</SheetDescription>
          </SheetHeader>
          {details && (
            <dl className="mt-4 space-y-3 text-sm">
              <Row2 k="Status"><ConsentBadge status={details.marketing_consent_status} /></Row2>
              <Row2 k="Source">{details.marketing_consent_source ?? "—"}</Row2>
              <Row2 k="Captured at">{details.marketing_consent_timestamp ? new Date(details.marketing_consent_timestamp).toLocaleString() : "—"}</Row2>
              <Row2 k="Captured on URL"><span className="break-all">{details.marketing_consent_url ?? "—"}</span></Row2>
              <Row2 k="Consent text"><span className="text-xs">{details.marketing_consent_text ?? "—"}</span></Row2>
              <Row2 k="IP hash"><span className="text-[10px] font-mono">{details.consent_ip_hash ?? "—"}</span></Row2>
              <Row2 k="Unsubscribed at">{details.unsubscribed_at ? new Date(details.unsubscribed_at).toLocaleString() : "—"}</Row2>
            </dl>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Row2({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
