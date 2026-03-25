import { useState } from "react";
import { Download, Key, BarChart3, ChevronRight, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { downloadPlugin } from "@/lib/plugin-download";
import { toast } from "sonner";

interface GetStartedGuideProps {
  compact?: boolean;
}

export default function GetStartedGuide({ compact = false }: GetStartedGuideProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);

  const steps = [
    {
      number: 1,
      title: t("getStarted.step1Title"),
      icon: Download,
      description: t("getStarted.step1Desc"),
      details: [
        t("getStarted.step1Detail1"),
        t("getStarted.step1Detail2"),
        t("getStarted.step1Detail3"),
      ],
      note: t("getStarted.step1Note"),
    },
    {
      number: 2,
      title: t("getStarted.step2Title"),
      icon: Key,
      description: t("getStarted.step2Desc"),
      details: [
        t("getStarted.step2Detail1"),
        t("getStarted.step2Detail2"),
        t("getStarted.step2Detail3"),
      ],
      note: t("getStarted.step2Note"),
    },
    {
      number: 3,
      title: t("getStarted.step3Title"),
      icon: BarChart3,
      description: t("getStarted.step3Desc"),
      details: [
        t("getStarted.step3Detail1"),
        t("getStarted.step3Detail2"),
        t("getStarted.step3Detail3"),
        t("getStarted.step3Detail4"),
      ],
      note: t("getStarted.step3Note"),
    },
  ];

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPlugin();
      toast.success(t("getStarted.downloadSuccess"));
    } catch {
      toast.error(t("getStarted.downloadFailed"));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={compact ? "" : "max-w-3xl mx-auto"}>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">
          {t("getStarted.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("getStarted.subtitle")}
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
          {downloading ? t("getStarted.downloading") : t("getStarted.downloadPlugin")}
        </button>
        <button
          onClick={() => navigate("/settings?tab=setup")}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          {t("getStarted.goToSetup")}
        </button>
      </div>
    </div>
  );
}
