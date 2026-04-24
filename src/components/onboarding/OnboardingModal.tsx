import { useState } from "react";
import { Target, Bell, Check, ChevronRight, Zap, Shield, ExternalLink } from "lucide-react";
import { useUpdateSiteSettings, PrimaryFocus, logUserInputEvent } from "@/hooks/use-site-settings";
import { useOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

const FOCUS_OPTIONS: { value: PrimaryFocus; label: string; description: string; icon: string }[] = [
  { value: "lead_volume", label: "Grow Lead Volume", description: "See where leads are coming from and how to get more.", icon: "📈" },
  { value: "marketing_impact", label: "Understand Marketing Impact", description: "See which traffic sources are driving real results.", icon: "💰" },
  { value: "conversion_performance", label: "Improve Conversion Performance", description: "Identify pages and forms that can convert better.", icon: "🎯" },
  { value: "paid_optimization", label: "Optimize Paid Traffic", description: "Spot underperforming paid traffic and improve efficiency.", icon: "✂️" },
];

const focusToGoal: Record<PrimaryFocus, string> = {
  lead_volume: "get_more_leads",
  marketing_impact: "prove_roi",
  conversion_performance: "improve_conversion",
  paid_optimization: "reduce_ad_waste",
};

const COMPLIANCE_CHECKS = [
  { key: "banner", label: "Cookie consent banner installed on my website" },
  { key: "blocking", label: "Analytics tracking blocked before visitor consent" },
  { key: "strict", label: "Strict consent mode enabled (recommended)" },
] as const;

export function OnboardingModal() {
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<PrimaryFocus>("lead_volume");
  const [notifications, setNotifications] = useState({
    weekly_summary: true,
    break_alerts: true,
    daily_digest: false,
    monitoring_alerts: true,
  });
  const [complianceChecks, setComplianceChecks] = useState<Record<string, boolean>>({
    banner: false,
    blocking: false,
    strict: false,
  });
  const [saving, setSaving] = useState(false);

  const { orgId } = useOrg();
  const updateSettings = useUpdateSiteSettings();

  const handleComplete = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        primary_goal: focusToGoal[focus] as any,
        primary_focus: focus,
        notification_preferences: notifications,
        onboarding_completed: true,
      });

      if (orgId) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from("onboarding_responses").insert({
          org_id: orgId,
          user_id: user?.id || null,
          primary_focus: focus,
          selected_forms_json: [],
          notification_prefs_json: notifications,
          raw_answers_json: { focus, notifications, compliance: complianceChecks },
        });

        await logUserInputEvent(orgId, "onboarding_completed", { primary_focus: focus, compliance_acknowledged: complianceChecks });
        await logUserInputEvent(orgId, "focus_changed", { new_value: focus, source: "onboarding" });
        await logUserInputEvent(orgId, "notification_pref_changed", { new_value: notifications, source: "onboarding" });
      }

      toast({ title: "Setup complete!", description: "Your dashboard is now personalized." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  const totalSteps = 3;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-slide-up">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i <= step ? "w-12 bg-primary" : "w-8 bg-border"}`} />
          ))}
        </div>

        <div className="glass-card p-8">
          {/* Step 0: Focus */}
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

          {/* Step 1: Privacy & Compliance */}
          {step === 1 && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Privacy & Compliance Setup</h2>
                  <p className="text-sm text-muted-foreground">Ensure your tracking is GDPR-compliant.</p>
                </div>
              </div>

              <div className="rounded-lg bg-warning/5 border border-warning/20 p-3 mb-4">
                <p className="text-sm text-foreground font-medium flex items-center gap-2">
                  <Shield className="h-4 w-4 text-warning" />
                  Consider adding a cookie consent banner
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  In many regions, GDPR and similar privacy laws ask for visitor consent before analytics tracking. A consent banner is a simple way to stay on the right side of those rules — it's your call whether and how to add one.
                </p>
              </div>

              <div className="space-y-3">
                {COMPLIANCE_CHECKS.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setComplianceChecks((p) => ({ ...p, [item.key]: !p[item.key] }))}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-3 ${
                      complianceChecks[item.key]
                        ? "border-success/30 bg-success/5"
                        : "border-border hover:border-primary/30"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      complianceChecks[item.key] ? "bg-success border-success" : "border-muted-foreground/30"
                    }`}>
                      {complianceChecks[item.key] && <Check className="h-3 w-3 text-success-foreground" />}
                    </div>
                    <span className="text-sm text-foreground">{item.label}</span>
                  </button>
                ))}
              </div>

              <Link
                to="/compliance-setup"
                className="flex items-center gap-1.5 text-sm text-primary hover:underline mt-4"
              >
                View Setup Guide <ExternalLink className="h-3.5 w-3.5" />
              </Link>

              <p className="text-xs text-muted-foreground mt-3">
                You can complete these steps later. This checklist is for your awareness — it does not block setup.
              </p>
            </>
          )}

          {/* Step 2: Notifications */}
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
            {step < totalSteps - 1 ? (
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
