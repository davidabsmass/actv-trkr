import { Eye, TrendingDown, Zap, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BlendedInsight {
  page: string;
  type: "seo_strong_engagement_weak" | "engagement_strong_seo_weak" | "seo_good_conversion_weak";
  title: string;
  explanation: string;
  metrics: Record<string, number | string>;
}

const typeIcons: Record<string, React.ReactNode> = {
  engagement_strong_seo_weak: <Eye className="h-4 w-4 text-primary" />,
  seo_good_conversion_weak: <TrendingDown className="h-4 w-4 text-warning" />,
  seo_strong_engagement_weak: <Zap className="h-4 w-4 text-accent-foreground" />,
};

interface Props {
  insights: BlendedInsight[];
}

export default function SeoBlendedInsights({ insights }: Props) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" /> {t("seo.blendedInsightsTitle")}
      </h3>
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <div key={i} className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-1.5">
              {typeIcons[insight.type]}
              <h4 className="text-sm font-semibold text-foreground">{insight.title}</h4>
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed mb-1">{insight.explanation}</p>
            <p className="text-xs text-muted-foreground">
              {t("seo.pageLabel")}: <span className="font-medium text-foreground">{insight.page}</span>
              {Object.entries(insight.metrics).map(([k, v]) => (
                <span key={k}> · {k}: <span className="font-medium text-foreground">{v}</span></span>
              ))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
