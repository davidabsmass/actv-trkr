import { useState } from "react";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { toast } from "@/hooks/use-toast";
import { addDays, format } from "date-fns";

interface SnapshotProps {
  snapshotData: Record<string, any>;
  startDate: string;
  endDate: string;
}

export function ShareableSnapshot({ snapshotData, startDate, endDate }: SnapshotProps) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const { orgId } = useOrg();

  const handleCreate = async () => {
    if (!orgId) return;
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("dashboard_snapshots")
        .insert({
          org_id: orgId,
          created_by: user.id,
          snapshot_data: snapshotData,
          date_range_start: startDate,
          date_range_end: endDate,
          expires_at: addDays(new Date(), 7).toISOString(),
        })
        .select("id")
        .single();

      if (error) throw error;

      const url = `${window.location.origin}/snapshot/${data.id}`;
      setLink(url);
      toast({ title: "Snapshot created", description: "Link expires in 7 days." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message });
    } finally {
      setCreating(false);
    }
  };

  const copyLink = () => {
    if (link) {
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); if (!link) handleCreate(); }}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-card border border-border rounded-lg hover:bg-muted transition-colors text-foreground"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <div className="glass-card p-6 w-full max-w-sm animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Share2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">{t("dashboard.shareableSnapshot")}</h3>
            </div>
            {creating ? (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">{t("dashboard.creatingSnapshot")}</p>
              </div>
            ) : link ? (
              <>
                <p className="text-xs text-muted-foreground mb-3">
                  Read-only link • {startDate} → {endDate} • Expires in 7 days
                </p>
                <div className="flex items-center gap-2 bg-secondary rounded-lg p-2.5">
                  <code className="text-xs font-mono text-secondary-foreground flex-1 truncate">{link}</code>
                  <button onClick={copyLink} className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0">
                    {copied ? <Check className="h-3.5 w-3.5 text-secondary-foreground" /> : <Copy className="h-3.5 w-3.5 text-secondary-foreground/70" />}
                  </button>
                </div>
              </>
            ) : null}
            <button onClick={() => setOpen(false)} className="w-full mt-4 py-2 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
