import { useSiteSettings, useUpdateSiteSettings } from "@/hooks/use-site-settings";
import { Bell } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface NotificationPrefs {
  weekly_summary: boolean;
  daily_digest: boolean;
  lead_realtime_email: boolean;
  lead_email_digest: boolean;
  lead_browser_push: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  weekly_summary: true,
  daily_digest: true,
  lead_realtime_email: true,
  lead_email_digest: true,
  lead_browser_push: true,
};

export default function NotificationsSection() {
  const { t } = useTranslation();
  const { settings, isLoading } = useSiteSettings();
  const updateSettings = useUpdateSiteSettings();

  const NOTIFICATION_OPTIONS: { key: keyof NotificationPrefs; labelKey: string; descKey: string }[] = [
    { key: "lead_realtime_email", labelKey: "settings.realtimeLeadEmails", descKey: "settings.realtimeLeadEmailsDesc" },
    { key: "lead_email_digest", labelKey: "settings.leadEmailDigest", descKey: "settings.leadEmailDigestDesc" },
    { key: "lead_browser_push", labelKey: "settings.browserPush", descKey: "settings.browserPushDesc" },
    { key: "weekly_summary", labelKey: "settings.weeklySummary", descKey: "settings.weeklySummaryDesc" },
    { key: "daily_digest", labelKey: "settings.dailyDigest", descKey: "settings.dailyDigestDesc" },
  ];

  const prefs: NotificationPrefs = {
    ...DEFAULT_PREFS,
    ...(settings?.notification_preferences as Partial<NotificationPrefs> ?? {}),
  };

  const toggle = async (key: keyof NotificationPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };

    if (key === "lead_browser_push" && !prefs[key]) {
      if (!("Notification" in window)) {
        toast({ variant: "destructive", title: t("settings.notSupported"), description: t("settings.browserNotSupported") });
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast({ variant: "destructive", title: t("settings.permissionDenied"), description: t("settings.enableInBrowser") });
        return;
      }
    }

    try {
      await updateSettings.mutateAsync({ notification_preferences: updated });
      const opt = NOTIFICATION_OPTIONS.find(o => o.key === key);
      toast({ title: updated[key] ? t("settings.enabled") : t("settings.disabled"), description: opt ? t(opt.labelKey) : "" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err?.message || "Failed to update" });
    }
  };

  if (isLoading) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("settings.notifications")}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {t("settings.notificationsDesc")}
      </p>
      <div className="space-y-3">
        {NOTIFICATION_OPTIONS.map(({ key, labelKey, descKey }) => (
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
                  className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${
                    prefs[key] ? "translate-x-4 bg-background" : "translate-x-0 bg-white"
                  }`}
                />
              </button>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
              <p className="text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}