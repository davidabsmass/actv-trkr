import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useSeoVisibility, type SeoVisibilityLevel } from "@/hooks/use-seo-visibility";
import { useUserRole } from "@/hooks/use-user-role";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Eye, EyeOff, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function SeoVisibilitySection() {
  const { orgId, orgName } = useOrg();
  const { isAdmin } = useUserRole();
  const { orgSeoLevel, loading } = useSeoVisibility();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<SeoVisibilityLevel | null>(null);

  // Only internal admins can see/manage this
  if (!isAdmin) return null;

  const currentValue = selected ?? orgSeoLevel;

  const handleSave = async () => {
    if (!orgId || currentValue === orgSeoLevel) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("orgs")
        .update({ seo_visibility_level: currentValue } as any)
        .eq("id", orgId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["seo_visibility_level", orgId] });
      toast.success(`SEO visibility updated to "${currentValue}" for ${orgName}`);
      setSelected(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to update SEO visibility");
    } finally {
      setSaving(false);
    }
  };

  const levelDescriptions: Record<SeoVisibilityLevel, { icon: React.ReactNode; desc: string }> = {
    hidden: { icon: <EyeOff className="h-4 w-4 text-muted-foreground" />, desc: "Client sees no SEO-related content" },
    summary: { icon: <BarChart3 className="h-4 w-4 text-primary" />, desc: "Client sees status-only search visibility overview" },
    advanced: { icon: <Eye className="h-4 w-4 text-success" />, desc: "Client sees full SEO diagnostics and scanning" },
  };

  const current = levelDescriptions[currentValue];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Search className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">SEO Visibility Level</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Controls what this workspace's clients see in the SEO / Search Visibility area.
        Internal team members always retain full access.
      </p>

      <div className="flex items-center gap-3">
        <Select
          value={currentValue}
          onValueChange={(v) => setSelected(v as SeoVisibilityLevel)}
          disabled={loading}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hidden">
              <div className="flex items-center gap-2">
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Hidden</span>
              </div>
            </SelectItem>
            <SelectItem value="summary">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                <span>Summary</span>
              </div>
            </SelectItem>
            <SelectItem value="advanced">
              <div className="flex items-center gap-2">
                <Eye className="h-3.5 w-3.5 text-success" />
                <span>Advanced</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>

        {selected && selected !== orgSeoLevel && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
        {current.icon}
        <span>{current.desc}</span>
      </div>
    </div>
  );
}
