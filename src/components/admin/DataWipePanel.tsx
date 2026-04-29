import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface OrgRow {
  id: string;
  name: string;
  created_at: string;
  member_count: number;
  site_count: number;
  member_emails: string[];
  site_domains?: string[];
}

/**
 * Active production clients that must NEVER appear in the data-wipe list.
 * Match is case-insensitive against org name OR any member email domain.
 */
const PROTECTED_CLIENTS = ["apyxmedical.com", "apyxmedical", "livesinthebalance.com", "livesinthebalance"];

function isProtectedOrg(org: OrgRow): boolean {
  const name = (org.name || "").toLowerCase();
  if (PROTECTED_CLIENTS.some((p) => name.includes(p))) return true;
  const emails = (org.member_emails || []).map((e) => e.toLowerCase());
  if (emails.some((e) => PROTECTED_CLIENTS.some((p) => e.includes(p)))) return true;
  const domains = (org.site_domains || []).map((d) => d.toLowerCase());
  return domains.some((d) => PROTECTED_CLIENTS.some((p) => d.includes(p)));
}

interface WipeReport {
  ok: boolean;
  org_name: string;
  org_id: string;
  report: Record<string, number | string>;
  errors: string[];
}

/**
 * Owner-only panel for completely removing a test client from the system.
 * Used for pre-launch testing — fully wipes the org, all data, the subscriber
 * record, and the auth users (when those users have no other org membership
 * and are not protected system administrators).
 *
 * After a wipe, the email addresses can be re-used to sign up from scratch
 * as if the customer had never existed.
 */
export default function DataWipePanel() {
  const queryClient = useQueryClient();
  const [confirmName, setConfirmName] = useState<Record<string, string>>({});
  const [wipingOrgId, setWipingOrgId] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<WipeReport | null>(null);

  const { data: orgs, isLoading } = useQuery({
    queryKey: ["data_wipe_orgs"],
    queryFn: async (): Promise<OrgRow[]> => {
      const { data, error } = await supabase.functions.invoke("admin-wipe-org", {
        body: { action: "list" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.orgs ?? []) as OrgRow[];
    },
  });

  const handleWipe = async (org: OrgRow) => {
    if (isProtectedOrg(org)) {
      toast.error(`"${org.name}" is a protected active client and cannot be wiped.`);
      return;
    }
    const typed = (confirmName[org.id] || "").trim();
    if (typed !== org.name) {
      toast.error("Type the exact organization name to confirm.");
      return;
    }
    const finalConfirm = window.confirm(
      `FINAL WARNING\n\nThis will permanently and irreversibly remove "${org.name}" and ALL of its data:\n\n• ${org.site_count} site(s)\n• ${org.member_count} member(s)\n• All leads, events, sessions, forms, settings, etc.\n• Subscribers + auth users (when they have no other org)\n\nProceed?`,
    );
    if (!finalConfirm) return;

    setWipingOrgId(org.id);
    setLastReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-wipe-org", {
        body: { orgId: org.id, confirmName: typed },
      });
      if (error) throw error;
      const report = data as WipeReport;
      if ((data as any)?.error) throw new Error((data as any).error);
      setLastReport(report);
      if (report.ok) {
        toast.success(`Wiped "${org.name}" — fully removed.`);
      } else {
        toast.warning(
          `Wiped "${org.name}" with ${report.errors.length} non-fatal error(s). See details below.`,
        );
      }
      setConfirmName((p) => ({ ...p, [org.id]: "" }));
      queryClient.invalidateQueries({ queryKey: ["data_wipe_orgs"] });
      queryClient.invalidateQueries({ queryKey: ["admin_orgs_setup"] });
      queryClient.invalidateQueries({ queryKey: ["owner_subscribers"] });
    } catch (e: any) {
      toast.error(e?.message || "Wipe failed");
    } finally {
      setWipingOrgId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-destructive/40 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-destructive text-base">
            <AlertTriangle className="h-5 w-5" />
            Pre-Launch Data Wipe — Testing Tool
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-foreground/80">
          <p>
            Use this only to remove <strong>test client data</strong> before launch. It permanently
            deletes the organization, every site, every lead/event/session, the subscriber record,
            and the user logins associated with it.
          </p>
          <p>
            <strong>Safety rules:</strong> Protected admins
            (<code>david@newuniformdesign.com</code>, <code>annie@newuniformdesign.com</code>) are
            never deleted. Users belonging to other orgs are kept; only their membership in the
            wiped org is removed. Everything else is gone for good.
          </p>
          <p className="rounded-md border border-success/40 bg-success/10 p-2 text-foreground">
            <strong>Protected active clients:</strong>{" "}
            {PROTECTED_CLIENTS.filter((p) => p.includes(".")).join(", ")}{" "}
            — hidden from this list and blocked server-side. They cannot be wiped.
          </p>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Loading organizations…</div>
      )}

      <div className="space-y-3">
        {(orgs ?? []).filter((o) => !isProtectedOrg(o)).map((org) => {
          const isWiping = wipingOrgId === org.id;
          const typed = confirmName[org.id] || "";
          const matches = typed.trim() === org.name;
          return (
            <Card key={org.id} className="border-border">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{org.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {org.site_count} site{org.site_count === 1 ? "" : "s"}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {org.member_count} member{org.member_count === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    ID: {org.id} · Created {new Date(org.created_at).toLocaleDateString()}
                  </div>
                  {org.member_emails.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Members: {org.member_emails.join(", ")}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Input
                    value={typed}
                    onChange={(e) =>
                      setConfirmName((p) => ({ ...p, [org.id]: e.target.value }))
                    }
                    placeholder="Type org name to confirm"
                    className="text-xs h-9 md:w-64"
                    disabled={isWiping}
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={!matches || isWiping}
                    onClick={() => handleWipe(org)}
                  >
                    {isWiping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    <span className="ml-2">Wipe</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {lastReport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Wipe report — {lastReport.org_name}
              <Badge
                variant={lastReport.ok ? "default" : "destructive"}
                className="ml-2 text-xs"
              >
                {lastReport.ok ? "Clean" : `${lastReport.errors.length} warning(s)`}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs font-mono bg-muted/40 rounded p-3 max-h-96 overflow-auto space-y-1">
              {Object.entries(lastReport.report).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-muted-foreground min-w-[14rem]">{k}</span>
                  <span className="text-foreground break-all">{String(v)}</span>
                </div>
              ))}
            </div>
            {lastReport.errors.length > 0 && (
              <div className="mt-3">
                <div className="text-sm font-semibold text-destructive mb-1">
                  Non-fatal errors
                </div>
                <ul className="text-xs font-mono bg-destructive/10 rounded p-3 space-y-1">
                  {lastReport.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
