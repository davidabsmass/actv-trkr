import { useState } from "react";
import { Download, Key, BarChart3, ChevronRight, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { downloadPlugin } from "@/lib/plugin-download";
import { toast } from "sonner";

const steps = [
  {
    number: 1,
    title: "Download & Install the Plugin",
    icon: Download,
    description: "Log into your ACTV TRKR account and download the WordPress plugin.",
    details: [
      "In your WordPress dashboard:",
      "Go to Plugins → Add New → Upload Plugin",
      "Upload the ACTV TRKR file and click Activate",
    ],
    note: "No code, no complicated setup.",
  },
  {
    number: 2,
    title: "Connect Your Website",
    icon: Key,
    description: "After activating the plugin, you'll see the ACTV TRKR settings panel.",
    details: [
      "Copy your API Key from your ACTV TRKR dashboard",
      "Paste it into the plugin settings",
      "Click Connect",
    ],
    note: "Your site is now linked and ready to start tracking.",
  },
  {
    number: 3,
    title: "Watch Your Data Come to Life",
    icon: BarChart3,
    description: "Within minutes, ACTV TRKR begins collecting:",
    details: [
      "Visitor activity",
      "Form submissions",
      "Traffic trends",
      "Lead insights",
    ],
    note: "Return to your dashboard anytime to see what's happening and what needs attention.",
  },
];

interface GetStartedGuideProps {
  compact?: boolean;
}

export default function GetStartedGuide({ compact = false }: GetStartedGuideProps) {
  const navigate = useNavigate();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPlugin();
      toast.success("Plugin downloaded! Upload it to WordPress → Plugins → Add New → Upload.");
    } catch {
      toast.error("Failed to download plugin");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={compact ? "" : "max-w-3xl mx-auto"}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">
          Get Started in 3 Simple Steps
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set up tracking on your WordPress site in under 5 minutes.
        </p>
      </div>

      <div className="space-y-4">
        {steps.map((step) => (
          <div
            key={step.number}
            className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/30"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                {step.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <step.icon className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {step.title}
                  </h3>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {step.description}
                </p>
                <ul className="space-y-1 mb-2">
                  {step.details.map((d, i) => (
                    <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary/60 flex-shrink-0" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs font-medium text-primary/80 italic">
                  {step.note}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mt-6">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {downloading ? "Downloading…" : "Download Plugin"}
        </button>
        <button
          onClick={() => navigate("/settings?tab=setup")}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Go to Website Setup
        </button>
      </div>
    </div>
  );
}
