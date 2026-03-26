import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { useTranslation } from "react-i18next";
import { Target, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface GoalConfig {
  id: string;
  name: string;
  match_type: string;
  match_value: string;
  event_type: string;
  is_conversion: boolean;
  created_at: string;
}

const MATCH_TYPES = [
  { value: "target_text_contains", labelKey: "goals.matchTextContains" },
  { value: "target_label_exact", labelKey: "goals.matchLabelExact" },
  { value: "page_path_contains", labelKey: "goals.matchPageContains" },
];

const EVENT_TYPES = [
  { value: "cta_click", labelKey: "goals.ctaClick" },
  { value: "download_click", labelKey: "goals.downloadClick" },
  { value: "outbound_click", labelKey: "goals.outboundClick" },
  { value: "tel_click", labelKey: "goals.telClick" },
  { value: "mailto_click", labelKey: "goals.mailtoClick" },
];

export default function GoalsSection() {
  const { t } = useTranslation();
  const { orgId } = useOrg();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [matchType, setMatchType] = useState("target_text_contains");
  const [matchValue, setMatchValue] = useState("");
  const [eventType, setEventType] = useState("cta_click");

  const { data: goals = [], isLoading } = useQuery({
    queryKey: ["goals_config", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from("goals_config" as any)
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      return (data || []) as unknown as GoalConfig[];
    },
    enabled: !!orgId,
  });

  const addGoal = useMutation({
    mutationFn: async () => {
      if (!orgId || !name.trim() || !matchValue.trim()) throw new Error("Missing fields");
      const { error } = await supabase.from("goals_config" as any).insert({
        org_id: orgId,
        name: name.trim(),
        match_type: matchType,
        match_value: matchValue.trim(),
        event_type: eventType,
        is_conversion: true,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals_config", orgId] });
      setName("");
      setMatchValue("");
      toast.success(t("goals.added"));
    },
    onError: () => toast.error(t("goals.addError")),
  });

  const deleteGoal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("goals_config" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals_config", orgId] });
      toast.success(t("goals.deleted"));
    },
  });

  return (
    <div className="glass-card p-6 lg:col-span-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-primary" />
        {t("goals.title")}
      </h3>
      <p className="text-xs text-muted-foreground mb-4">{t("goals.description")}</p>

      {/* Add form */}
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs text-muted-foreground mb-1 block">{t("goals.goalName")}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("goals.namePlaceholder")} className="h-8 text-sm" />
        </div>
        <div className="w-[180px]">
          <label className="text-xs text-muted-foreground mb-1 block">{t("goals.matchRule")}</label>
          <Select value={matchType} onValueChange={setMatchType}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MATCH_TYPES.map((mt) => (
                <SelectItem key={mt.value} value={mt.value}>{t(mt.labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs text-muted-foreground mb-1 block">{t("goals.matchValue")}</label>
          <Input value={matchValue} onChange={(e) => setMatchValue(e.target.value)} placeholder={t("goals.valuePlaceholder")} className="h-8 text-sm" />
        </div>
        <div className="w-[150px]">
          <label className="text-xs text-muted-foreground mb-1 block">{t("goals.eventType")}</label>
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EVENT_TYPES.map((et) => (
                <SelectItem key={et.value} value={et.value}>{t(et.labelKey)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => addGoal.mutate()} disabled={!name.trim() || !matchValue.trim() || addGoal.isPending}>
          <Plus className="h-3.5 w-3.5 mr-1" /> {t("goals.add")}
        </Button>
      </div>

      {/* Goals list */}
      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}</div>
      ) : goals.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">{t("goals.empty")}</p>
      ) : (
        <div className="space-y-2">
          {goals.map((g) => (
            <div key={g.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div className="flex items-center gap-3">
                <Target className="h-3.5 w-3.5 text-primary" />
                <div>
                  <span className="text-sm font-medium text-foreground">{g.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {t(`goals.${g.match_type === "target_text_contains" ? "matchTextContains" : g.match_type === "target_label_exact" ? "matchLabelExact" : "matchPageContains"}`)}
                    : "{g.match_value}" · {g.event_type}
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteGoal.mutate(g.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
