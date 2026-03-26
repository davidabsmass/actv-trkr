import { useState } from "react";
import { X, Rocket } from "lucide-react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

interface GetStartedBannerProps { hasSites: boolean; }

export function GetStartedBanner({ hasSites }: GetStartedBannerProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem("at_get_started_dismissed") === "true");

  if (hasSites || dismissed) return null;

  const handleDismiss = () => { setDismissed(true); localStorage.setItem("at_get_started_dismissed", "true"); };

  return (
    <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6 animate-slide-up">
      <IconTooltip label={t("common.dismiss", "Dismiss")}>
        <button onClick={handleDismiss} className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"><X className="h-4 w-4" /></button>
      </IconTooltip>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Rocket className="h-5 w-5" /></div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground mb-1">{t("dashboard.welcomeBanner")}</h3>
          <p className="text-sm text-muted-foreground mb-3">{t("dashboard.welcomeBannerDesc")}</p>
          <button onClick={() => navigate("/get-started")} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Rocket className="h-3.5 w-3.5" />
            {t("dashboard.startSetup")}
          </button>
        </div>
      </div>
    </div>
  );
}
