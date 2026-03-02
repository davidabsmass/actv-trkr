import { useState, useEffect } from "react";
import { useOrg } from "@/hooks/use-org";
import { useSiteSettings, useUpdateSiteSettings } from "@/hooks/use-site-settings";
import { Bell } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface NotificationPrefs {
  weekly_summary: boolean;
  break_alerts: boolean;
  daily_digest: boolean;
  lead_realtime_email: boolean;
  lead_email_digest: boolean;
  lead_browser_push: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  weekly_summary: true,
  break_alerts: true,
  daily_digest: false,
  lead_realtime_email: false,
  lead_email_digest: false,
  lead_browser_push: false,
};

const NOTIFICATION_OPTIONS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: "lead_realtime_email", label: "Real-time lead emails", description: "Get an email instantly when a new form submission arrives" },
  { key: "lead_email_digest", label: "Lead email digest", description: "Receive a periodic summary of new leads" },
  { key: "lead_browser_push", label: "Browser push notifications", description: "Desktop notifications for new leads (requires permission)" },
  { key: "weekly_summary", label: "Weekly summary", description: "Weekly performance recap email" },
  { key: "break_alerts", label: "Break alerts", description: "Alert when no submissions are received during business hours" },
  { key: "daily_digest", label: "Daily digest", description: "Daily summary of activity" },
];

export default function NotificationsSection() {
  const { settings, isLoading } = useSiteSettings();
  const updateSettings = useUpdateSiteSettings();

  const prefs: NotificationPrefs = {
    ...DEFAULT_PREFS,
    ...(settings?.notification_preferences as Partial<NotificationPrefs> ?? {}),
  };

  const toggle = async (key: keyof NotificationPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };

    // Handle browser push permission request
    if (key === "lead_browser_push" && !prefs[key]) {
      if (!("Notification" in window)) {
        toast({ variant: "destructive", title: "Not supported", description: "Your browser doesn't support push notifications." });
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast({ variant: "destructive", title: "Permission denied", description: "Enable notifications in your browser settings." });
        return;
      }
    }

    try {
      await updateSettings.mutateAsync({ notification_preferences: updated });
      toast({ title: updated[key] ? "Enabled" : "Disabled", description: NOTIFICATION_OPTIONS.find(o => o.key === key)?.label });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Failed to update" });
    }
  };

  if (isLoading) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Choose how you want to be notified about new leads and activity.
      </p>
      <div className="space-y-3">
        {NOTIFICATION_OPTIONS.map(({ key, label, description }) => (
          <label key={key} className="flex items-start gap-3 cursor-pointer group">
            <div className="pt-0.5">
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                onClick={() => toggle(key)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  prefs[key] ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                    prefs[key] ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
