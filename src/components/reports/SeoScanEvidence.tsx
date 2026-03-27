import { Info, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

interface ScanSignals {
  title_text: string | null;
  title_length: number;
  meta_description_text: string | null;
  meta_description_length: number;
  og_title: string | null;
  og_image: string | null;
  canonical: string | null;
  final_url: string;
  fetched_at: string;
}

interface Props {
  signals: ScanSignals;
}

function isHomepageDefaultTitle(title: string | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase().trim();
  return /^home\s*[-–—|:]/i.test(t) || t === "home" || /^homepage\s*[-–—|:]/i.test(t);
}

export default function SeoScanEvidence({ signals }: Props) {
  const { t } = useTranslation();
  const shortTitle = signals.title_length > 0 && signals.title_length < 30;
  const showHomepageHint = shortTitle && isHomepageDefaultTitle(signals.title_text);

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Info className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold text-foreground">
          {t("seo.whatWeScanned", { defaultValue: "What We Scanned" })}
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {/* Title */}
        <div className="space-y-1">
          <span className="text-muted-foreground uppercase tracking-wider font-medium">
            {t("seo.pageTitle", { defaultValue: "Page Title" })}
          </span>
          <p className="text-foreground font-mono break-all">
            {signals.title_text ? `"${decodeHtmlEntities(signals.title_text)}"` : <span className="text-destructive italic">Not found</span>}
          </p>
          <p className="text-muted-foreground">
            {signals.title_length} {t("seo.chars", { defaultValue: "chars" })}
            {shortTitle && (
              <span className="text-warning ml-1">
                ({t("seo.aimFor", { defaultValue: "aim for 30–60" })})
              </span>
            )}
          </p>
        </div>

        {/* Meta Description */}
        <div className="space-y-1">
          <span className="text-muted-foreground uppercase tracking-wider font-medium">
            {t("seo.metaDescription", { defaultValue: "Meta Description" })}
          </span>
          <p className="text-foreground font-mono break-all line-clamp-2">
            {signals.meta_description_text
              ? (() => { const d = decodeHtmlEntities(signals.meta_description_text); return `"${d.slice(0, 100)}${d.length > 100 ? "…" : ""}"`; })()
              : <span className="text-destructive italic">Not found</span>}
          </p>
          <p className="text-muted-foreground">{signals.meta_description_length} {t("seo.chars", { defaultValue: "chars" })}</p>
        </div>

        {/* Canonical */}
        <div className="space-y-1">
          <span className="text-muted-foreground uppercase tracking-wider font-medium">Canonical</span>
          <p className="text-foreground font-mono break-all">
            {signals.canonical || <span className="text-muted-foreground italic">None</span>}
          </p>
        </div>

        {/* Fetched At */}
        <div className="space-y-1">
          <span className="text-muted-foreground uppercase tracking-wider font-medium">
            {t("seo.scannedAt", { defaultValue: "Scanned At" })}
          </span>
          <p className="text-foreground">
            {signals.fetched_at
              ? new Date(signals.fetched_at).toLocaleString()
              : "—"}
          </p>
        </div>
      </div>

      {/* OG Image */}
      {signals.og_image && (
        <div className="space-y-1.5 pt-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            {t("seo.ogImage", { defaultValue: "Open Graph Image" })}
          </span>
          <div className="rounded-md border border-border overflow-hidden bg-muted/30 max-w-sm">
            <img
              src={signals.og_image}
              alt="Open Graph preview"
              className="w-full h-auto object-cover max-h-48"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground font-mono break-all">{signals.og_image}</p>
        </div>
      )}

      {/* Smart homepage hint */}
      {showHomepageHint && (
        <div className="flex items-start gap-2 rounded-md bg-warning/10 border border-warning/20 p-3 mt-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-foreground space-y-1">
            <p className="font-medium">
              {t("seo.homepageTitleHint", {
                defaultValue: "The live source is still serving a short homepage-style title.",
              })}
            </p>
            <p className="text-muted-foreground">
              {t("seo.homepageTitleAdvice", {
                defaultValue:
                  "In WordPress/Avada, the homepage SEO title can be overridden by the theme's \"Page Title Bar\" settings, Yoast's homepage SEO title, or the page-level title in Avada Page Options. Check all three sources to find which one is active.",
              })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
