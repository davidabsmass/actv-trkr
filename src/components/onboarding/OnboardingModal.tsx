import { useState } from "react";
import { Target, FileCheck, Bell, Check, ChevronRight, Zap } from "lucide-react";
import { useUpdateSiteSettings, PrimaryGoal } from "@/hooks/use-site-settings";
import { useForms } from "@/hooks/use-dashboard-data";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const GOALS: { value: PrimaryGoal; label: string; description: string; icon: string }[] = [
  { value: "get_more_leads", label: "Get More Leads", description: "Focus on lead volume and top-performing pages", icon: "📈" },
  { value: "prove_roi", label: "Prove Marketing ROI", description: "Track cost per lead and revenue impact by source", icon: "💰" },
  { value: "improve_conversion", label: "Improve Conversion Rate", description: "Optimize funnels and page-level conversion", icon: "🎯" },
  { value: "reduce_ad_waste", label: "Reduce Wasted Ad Spend", description: "Identify underperforming paid campaigns", icon: "✂️" },
];

export function OnboardingModal() {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<PrimaryGoal>("get_more_leads");
  const [notifications, setNotifications] = useState({
    weekly_summary: true,
    break_alerts: true,
    daily_digest: false,
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
      // Update form settings
      if (forms) {
        for (const form of forms) {
          const isPrimary = formToggles[form.id] !== undefined ? formToggles[form.id] : true;
          const estValue = formValues[form.id] ? parseFloat(formValues[form.id]) : form.estimated_value;
          await supabase
            .from("forms")
            .update({ is_primary_lead: isPrimary, estimated_value: estValue || 0 })
            .eq("id", form.id);
        }
      }

      // Save settings + mark onboarding complete
      await updateSettings.mutateAsync({
        primary_goal: goal,
        notification_preferences: notifications,
        onboarding_completed: true,
      });

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
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">What's your primary goal?</h2>
                  <p className="text-sm text-muted-foreground">This personalizes your dashboard experience.</p>
                </div>
              </div>
              <div className="space-y-3">
                {GOALS.map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGoal(g.value)}
                    className={`w-full text-left p-4 rounded-lg border transition-all ${
                      goal === g.value
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
                      {goal === g.value && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </button>
                ))}
              </div>
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
                          <p className="text-[10px] text-muted-foreground uppercase">{form.provider}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">$</span>
                          <input
                            type="number"
                            placeholder="0"
                            value={formValues[form.id] ?? (form.estimated_value || "")}
                            onChange={(e) => setFormValues((p) => ({ ...p, [form.id]: e.target.value }))}
                            className="w-20 px-2 py-1 text-xs bg-secondary border border-border rounded text-foreground"
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
