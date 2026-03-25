import { useState } from "react";
import { Target, FileCheck, Bell, Check, ChevronRight, Zap } from "lucide-react";
import { useUpdateSiteSettings, PrimaryFocus, logUserInputEvent } from "@/hooks/use-site-settings";
import { useForms } from "@/hooks/use-dashboard-data";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const FOCUS_OPTIONS: { value: PrimaryFocus; label: string; description: string; icon: string }[] = [
  { value: "lead_volume", label: "Grow Lead Volume", description: "See where leads are coming from and how to get more.", icon: "📈" },
  { value: "marketing_impact", label: "Understand Marketing Impact", description: "See which traffic sources are driving real results.", icon: "💰" },
  { value: "conversion_performance", label: "Improve Conversion Performance", description: "Identify pages and forms that can convert better.", icon: "🎯" },
  { value: "paid_optimization", label: "Optimize Paid Traffic", description: "Spot underperforming paid traffic and improve efficiency.", icon: "✂️" },
];

// Map focus to legacy goal for backward compat
const focusToGoal: Record<PrimaryFocus, string> = {
  lead_volume: "get_more_leads",
  marketing_impact: "prove_roi",
  conversion_performance: "improve_conversion",
  paid_optimization: "reduce_ad_waste",
};

export function OnboardingModal() {
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<PrimaryFocus>("lead_volume");
  const [notifications, setNotifications] = useState({
    weekly_summary: true,
    break_alerts: true,
    daily_digest: false,
    monitoring_alerts: true,
  });
  const [formToggles, setFormToggles] = useState<Record<string, boolean>>({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { orgId } = useOrg();
  const { data: forms } = useForms(orgId);
  const updateSettings = useUpdateSiteSettings();

  const handleComplete = async () => {
    setSaving(true);
    try {
      const selectedForms: any[] = [];

      // Update form settings
      if (forms) {
        for (const form of forms) {
          const isPrimary = formToggles[form.id] !== undefined ? formToggles[form.id] : true;
          const estValue = formValues[form.id] ? parseFloat(formValues[form.id]) : form.estimated_value;
          await supabase
            .from("forms")
            .update({ is_primary_lead: isPrimary, estimated_value: estValue || 0 })
            .eq("id", form.id);
          selectedForms.push({ form_id: form.id, counts_as_lead: isPrimary, estimated_value: estValue || 0 });
        }
      }

      // Save settings + mark onboarding complete
      await updateSettings.mutateAsync({
        primary_goal: focusToGoal[focus] as any,
        primary_focus: focus,
        notification_preferences: notifications,
        onboarding_completed: true,
      });

      // Write onboarding_responses row
      if (orgId) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("onboarding_responses").insert({
          org_id: orgId,
          user_id: user?.id || null,
          primary_focus: focus,
          selected_forms_json: selectedForms,
          notification_prefs_json: notifications,
          raw_answers_json: { focus, formToggles, formValues, notifications },
        });

        // Log individual events
        await logUserInputEvent(orgId, "onboarding_completed", { primary_focus: focus });
        await logUserInputEvent(orgId, "focus_changed", { new_value: focus, source: "onboarding" });
        if (selectedForms.length > 0) {
          await logUserInputEvent(orgId, "lead_forms_configured", { forms: selectedForms, source: "onboarding" });
        }
        await logUserInputEvent(orgId, "notification_pref_changed", { new_value: notifications, source: "onboarding" });
      }

      toast({ title: "Setup complete!", description: "Your dashboard is now personalized." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-slide-up">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i <= step ? "w-12 bg-primary" : "w-8 bg-border"}`} />
          ))}
        </div>

        <div className="glass-card p-8">
          {step === 0 && (
            <>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">What do you want to focus on?</h2>
                  <p className="text-sm text-muted-foreground">This simply adjusts how your dashboard is prioritized. You can change it anytime.</p>
                </div>
              </div>
              <div className="space-y-3 mt-5">
                {FOCUS_OPTIONS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setFocus(g.value)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      focus === g.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                        : "border-border hover:border-primary/30 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{g.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{g.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>
                      </div>
                      {focus === g.value && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4 text-center">
                No integrations required. This only changes how insights are prioritized.
              </p>
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Confirm Your Lead Forms</h2>
                  <p className="text-sm text-muted-foreground">Toggle which forms count as leads and set values.</p>
                </div>
              </div>
              {forms && forms.length > 0 ? (
                <div className="space-y-3 max-h-[320px] overflow-y-auto">
                  {forms.map((form) => {
                    const isOn = formToggles[form.id] !== undefined ? formToggles[form.id] : true;
                    return (
                      <div key={form.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                        <button
                          onClick={() => setFormToggles((p) => ({ ...p, [form.id]: !isOn }))}
                          className={`w-10 h-6 rounded-full relative transition-colors ${isOn ? "bg-primary" : "bg-muted"}`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${isOn ? "left-[18px]" : "left-0.5"}`} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{form.name}</p>
                          <p className="text-xs text-muted-foreground uppercase">{form.provider}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={formValues[form.id] ?? (form.estimated_value || "")}
                            onChange={(e) => setFormValues((p) => ({ ...p, [form.id]: e.target.value }))}
                            className="w-20 px-2 py-1 text-xs bg-white border border-border rounded text-foreground"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No forms detected yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Forms will appear once your tracking plugin sends data.</p>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Notification Preferences</h2>
                  <p className="text-sm text-muted-foreground">Choose how you want to stay informed.</p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { key: "monitoring_alerts" as const, label: "Monitoring Alerts", desc: "Get notified about downtime, SSL expiry, and domain issues" },
                  { key: "weekly_summary" as const, label: "Weekly Performance Summary", desc: "Monday morning digest of your website performance" },
                  { key: "break_alerts" as const, label: "Immediate Break Alerts", desc: "Get notified when forms stop working or traffic drops" },
                  { key: "daily_digest" as const, label: "Daily Performance Digest", desc: "A quick overview of yesterday's performance" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-4 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setNotifications((p) => ({ ...p, [item.key]: !p[item.key] }))}
                      className={`w-10 h-6 rounded-full relative transition-colors ${notifications[item.key] ? "bg-primary" : "bg-muted"}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm ${notifications[item.key] ? "left-[18px]" : "left-0.5"}`} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8">
            {step > 0 ? (
              <button onClick={() => setStep((s) => s - 1)} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Back
              </button>
            ) : <span />}
            {step < 2 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Zap className="h-4 w-4" />
                {saving ? "Saving..." : "Launch Dashboard"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
