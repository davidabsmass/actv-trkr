import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useForms } from "@/hooks/use-dashboard-data";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Archive, ArchiveRestore, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function FormsSection() {
  const { orgId } = useOrg();
  const { data: forms, isLoading } = useForms(orgId);
  const queryClient = useQueryClient();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const activeForms = forms?.filter((f) => !f.archived) ?? [];
  const archivedForms = forms?.filter((f) => f.archived) ?? [];
  const displayedForms = showArchived ? archivedForms : activeForms;

  const toggleArchive = async (formId: string, currentlyArchived: boolean) => {
    setTogglingId(formId);
    try {
      const { error } = await supabase
        .from("forms")
        .update({ archived: !currentlyArchived })
        .eq("id", formId);
      if (error) throw error;
      toast({
        title: currentlyArchived ? "Form restored" : "Form archived",
        description: currentlyArchived
          ? "The form is now visible in your dashboard."
          : "The form has been hidden from your dashboard.",
      });
      queryClient.invalidateQueries({ queryKey: ["forms", orgId] });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: err?.message || "Something went wrong",
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Discovered Forms</h3>
        </div>
        {archivedForms.length > 0 && (
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showArchived ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                Show Active ({activeForms.length})
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Show Archived ({archivedForms.length})
              </>
            )}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Forms are automatically discovered by the plugin. Use "Sync Forms" in your WordPress plugin settings to rescan.
        Archive forms you no longer want to track.
      </p>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : displayedForms.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {showArchived
            ? "No archived forms."
            : "No active forms discovered yet. Install the plugin and click 'Sync Forms' in WordPress."}
        </p>
      ) : (
        <div className="space-y-2">
          {displayedForms.map((form) => (
            <div
              key={form.id}
              className="flex items-center justify-between p-3 rounded-md bg-secondary/50"
            >
              <div>
                <p className="text-sm font-medium text-secondary-foreground">
                  {form.name}
                </p>
                <p className="text-[11px] text-secondary-foreground/70">
                  {form.provider} · {form.form_category}
                  {form.external_form_id ? ` · #${form.external_form_id}` : ""}
                </p>
              </div>
              <button
                onClick={() => toggleArchive(form.id, form.archived)}
                disabled={togglingId === form.id}
                className="flex items-center gap-1 p-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title={form.archived ? "Restore form" : "Archive form"}
              >
                {form.archived ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
