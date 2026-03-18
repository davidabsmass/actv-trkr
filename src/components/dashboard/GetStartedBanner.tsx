import { useState } from "react";
import { X, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface GetStartedBannerProps {
  hasSites: boolean;
}

export function GetStartedBanner({ hasSites }: GetStartedBannerProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem("at_get_started_dismissed") === "true";
  });

  // Don't show if already has sites or was dismissed
  if (hasSites || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("at_get_started_dismissed", "true");
  };

  return (
    <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-4 mb-6 animate-slide-up">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Welcome! Let's get your site connected
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Follow our 3-step guide to install the plugin, connect your API key, and start seeing real-time data.
          </p>
          <button
            onClick={() => navigate("/get-started")}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Rocket className="h-3.5 w-3.5" />
            Start Setup
          </button>
        </div>
      </div>
    </div>
  );
}
