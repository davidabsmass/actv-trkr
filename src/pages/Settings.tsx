import { useState } from "react";
import { useOrg } from "@/hooks/use-org";
import { useSiteSettings, useUpdateSiteSettings, PrimaryFocus, logUserInputEvent } from "@/hooks/use-site-settings";
import ApiKeysSection from "@/components/settings/ApiKeysSection";
import SitesSection from "@/components/settings/SitesSection";
import PluginSection from "@/components/settings/PluginSection";
import { toast } from "@/hooks/use-toast";
import { Check } from "lucide-react";

const FOCUS_OPTIONS: { value: PrimaryFocus; label: string }[] = [
  { value: "lead_volume", label: "📈 Grow Lead Volume" },
  { value: "marketing_impact", label: "💰 Understand Marketing Impact" },
  { value: "conversion_performance", label: "🎯 Improve Conversion Performance" },
  { value: "paid_optimization", label: "✂️ Optimize Paid Traffic" },
];

export default function SettingsPage() {
  const { orgName, orgId } = useOrg();
  const { settings } = useSiteSettings();
  const updateSettings = useUpdateSiteSettings();
  const [changingFocus, setChangingFocus] = useState(false);

  const currentFocus = settings?.primary_focus || "lead_volume";

  const handleFocusChange = async (newFocus: PrimaryFocus) => {
    if (newFocus === currentFocus || !orgId) return;
    setChangingFocus(true);
    try {
      const oldFocus = currentFocus;
      await updateSettings.mutateAsync({ primary_focus: newFocus });
      await logUserInputEvent(orgId, "focus_changed", { old_value: oldFocus, new_value: newFocus, source: "settings" });
      toast({ title: "Dashboard focus updated", description: "No tracking changes required." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message });
    } finally {
      setChangingFocus(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-1">Settings</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Configuration for {orgName}
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Focus Selector */}
        <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-1">Dashboard Focus</h3>
          <p className="text-xs text-muted-foreground mb-4">This adjusts how your dashboard sections are prioritized. You can change it anytime.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FOCUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleFocusChange(opt.value)}
                disabled={changingFocus}
                className={`text-left px-4 py-3 rounded-lg border transition-all text-sm font-medium ${
                  currentFocus === opt.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  {opt.label}
                  {currentFocus === opt.value && <Check className="h-4 w-4 text-primary" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <PluginSection />
        <ApiKeysSection />
        <SitesSection />

        {[
          { title: "Forms & Mapping", desc: "Configure field mappings for lead forms" },
          { title: "URL Rules", desc: "Infer service/location from page paths" },
          { title: "Goals", desc: "Set monthly lead targets" },
          { title: "Schedules", desc: "Automated report delivery" },
        ].map((s) => (
          <div key={s.title} className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-1">{s.title}</h3>
            <p className="text-xs text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
