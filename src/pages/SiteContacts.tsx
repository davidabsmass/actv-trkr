import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Search, Download, Upload, Shield, Loader2 } from "lucide-react";
import { ConsentBadge } from "@/components/contacts/ConsentBadge";
import { downloadCsv } from "@/lib/csv-export";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Row = {
  email: string;
  display_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  lead_count: number;
  source_sites: string[] | null;
  source_forms: string[] | null;
  source_pages: string[] | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  customer_consent_status: string | null;
  tags: string[] | null;
  total_count: number;
};

export default function SiteContactsPage() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["site_contacts", orgId, search],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_site_contacts", {
        p_org_id: orgId,
        p_limit: 500,
        p_offset: 0,
        p_search: search || null,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;

  const handleExport = async () => {
    if (!rows.length) {
      toast({ title: "No contacts to export" });
      return;
    }
    const exportRows = rows.map((r) => ({
      email: r.email,
      name: r.display_name ?? "",
      first_seen: r.first_seen_at,
      last_seen: r.last_seen_at,
      lead_count: r.lead_count,
      source_sites: (r.source_sites ?? []).join("; "),
      source_forms: (r.source_forms ?? []).join("; "),
      utm_source: r.utm_source ?? "",
      utm_medium: r.utm_medium ?? "",
      utm_campaign: r.utm_campaign ?? "",
      utm_content: r.utm_content ?? "",
      utm_term: r.utm_term ?? "",
      customer_marketing_consent_status: r.customer_consent_status ?? "unknown",
      tags: (r.tags ?? []).join("; "),
    }));
    downloadCsv(`site-contacts-${new Date().toISOString().slice(0, 10)}.csv`, exportRows);

    // Best-effort audit log
    try {
      await (supabase as any).rpc("log_security_event", {
        p_event_type: "site_contacts_exported",
        p_severity: "info",
        p_org_id: orgId,
        p_actor_type: "user",
        p_message: "Site contacts CSV exported",
        p_metadata: { row_count: exportRows.length },
      });
    } catch { /* non-fatal */ }
  };

  const formatList = (arr: string[] | null | undefined, max = 2) => {
    const list = arr ?? [];
    if (!list.length) return <span className="text-muted-foreground">—</span>;
    const head = list.slice(0, max).join(", ");
    const extra = list.length - max;
    return <>{head}{extra > 0 ? ` +${extra}` : ""}</>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Site Contacts</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          These contacts were captured from your connected website. They belong to your organization
          and are never used by ACTV TRKR for its own marketing.
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">ACTV TRKR does not use your website leads for its own marketing.</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              You can export your Site Contacts to your own email or CRM provider. ACTV TRKR never
              syncs these contacts into our marketing list.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">All site contacts</CardTitle>
              <CardDescription>
                {isLoading ? "Loading…" : `${total} unique contact${total === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email or name…"
                  className="pl-8 h-9 w-56"
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" size="sm" disabled className="gap-1.5">
                      <Upload className="h-3.5 w-3.5" />
                      Sync to provider
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Coming soon — Mailchimp / Brevo / Loops integrations</TooltipContent>
              </Tooltip>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Export site contacts</AlertDialogTitle>
                    <AlertDialogDescription>
                      Only send marketing emails to contacts who have opted in according to your
                      organization&apos;s consent policies. The export includes any consent metadata
                      we&apos;ve detected from your form fields.
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
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No site contacts captured yet. Contacts appear here as your connected sites receive
              form submissions with an email address.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Source site</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead>UTM</TableHead>
                    <TableHead>Consent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.email}>
                      <TableCell>
                        <div className="font-medium text-sm">{r.email}</div>
                        {r.display_name && (
                          <div className="text-xs text-muted-foreground">{r.display_name}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatList(r.source_sites)}</TableCell>
                      <TableCell className="text-sm">{formatList(r.source_forms)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.last_seen_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm">{r.lead_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {[r.utm_source, r.utm_medium, r.utm_campaign].filter(Boolean).join(" / ") || "—"}
                      </TableCell>
                      <TableCell>
                        <ConsentBadge status={r.customer_consent_status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
