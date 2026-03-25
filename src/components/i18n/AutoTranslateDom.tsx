import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

const TEXT_TAGS = "h1,h2,h3,h4,h5,h6,p,span,button,a,label,th,td,option,small,strong,em,li";
const ATTRS = ["placeholder", "title", "aria-label"] as const;

const shouldTranslate = (value: string) => {
  const text = value.trim();
  if (!text || text.length < 2 || text.length > 220) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^[-–—•\d\s%.,:/()]+$/.test(text)) return false;
  if (/^(https?:\/\/|www\.)/i.test(text)) return false;
  return true;
};

const getCache = (lang: string): Record<string, string> => {
  try {
    const raw = localStorage.getItem(`at_auto_i18n_${lang}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const setCache = (lang: string, cache: Record<string, string>) => {
  try {
    localStorage.setItem(`at_auto_i18n_${lang}`, JSON.stringify(cache));
  } catch {
    // ignore storage issues
  }
};

export default function AutoTranslateDom() {
  const { i18n } = useTranslation();
  const location = useLocation();

  const targetLanguage = useMemo(() => i18n.language.split("-")[0], [i18n.language]);

  useEffect(() => {
    const root = document.querySelector("main") ?? document.body;
    if (!root) return;

    const elements = Array.from(root.querySelectorAll<HTMLElement>(TEXT_TAGS));

    const restoreEnglish = () => {
      elements.forEach((el) => {
        if (el.dataset.atOrigText) {
          el.textContent = el.dataset.atOrigText;
        }
        ATTRS.forEach((attr) => {
          const key = `atOrig${attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase())}`;
          const original = (el.dataset as Record<string, string | undefined>)[key];
          if (original !== undefined) el.setAttribute(attr, original);
        });
      });
    };

    if (targetLanguage === "en") {
      restoreEnglish();
      return;
    }

    const items: Array<{ el: HTMLElement; type: "text" | "attr"; value: string; attr?: (typeof ATTRS)[number] }> = [];

    elements.forEach((el) => {
      if (el.closest("[data-no-auto-translate='true']")) return;

      const isLeaf = el.childElementCount === 0 || (el.tagName === "BUTTON" && el.textContent?.trim());
      if (isLeaf) {
        const original = el.dataset.atOrigText || el.textContent?.trim() || "";
        if (shouldTranslate(original)) {
          if (!el.dataset.atOrigText) el.dataset.atOrigText = original;
          items.push({ el, type: "text", value: original });
        }
      }

      ATTRS.forEach((attr) => {
        const datasetKey = `atOrig${attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase())}`;
        const original = (el.dataset as Record<string, string | undefined>)[datasetKey] ?? el.getAttribute(attr) ?? "";
        if (shouldTranslate(original)) {
          if (!(el.dataset as Record<string, string | undefined>)[datasetKey]) {
            (el.dataset as Record<string, string | undefined>)[datasetKey] = original;
          }
          items.push({ el, type: "attr", value: original, attr });
        }
      });
    });

    if (items.length === 0) return;

    const applyTranslations = (cache: Record<string, string>) => {
      items.forEach(({ el, type, value, attr }) => {
        const translated = cache[value] || value;
        if (type === "text") {
          el.textContent = translated;
        } else if (attr) {
          el.setAttribute(attr, translated);
        }
      });
    };

    const run = async () => {
      const cache = getCache(targetLanguage);
      const missing = [...new Set(items.map((i) => i.value))].filter((text) => !cache[text]);

      if (missing.length > 0) {
        const { data } = await supabase.functions.invoke("auto-translate-ui", {
          body: { target: targetLanguage, texts: missing.slice(0, 300) },
        });
        const translated = (data?.translations || {}) as Record<string, string>;
        Object.assign(cache, translated);
        setCache(targetLanguage, cache);
      }

      applyTranslations(cache);
    };

    run().catch(() => {
      // silently fail to avoid impacting navigation
    });
  }, [targetLanguage, location.pathname]);

  return null;
}