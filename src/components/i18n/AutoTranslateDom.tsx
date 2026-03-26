import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

const TEXT_TAGS = "h1,h2,h3,h4,h5,h6,p,span,button,a,label,th,td,option,small,strong,em,li";
const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;
const originalNodeText = new WeakMap<Text, string>();

const shouldTranslate = (value: string) => {
  const text = value.trim();
  if (!text || text.length < 1 || text.length > 500) return false;
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
  const applyingRef = useRef(false);
  const prevLangRef = useRef(i18n.language.split("-")[0]);

  const targetLanguage = useMemo(() => i18n.language.split("-")[0], [i18n.language]);

  useEffect(() => {
    const root = document.body;
    if (!root) return;

    // Smooth fade when language actually changes
    const isLangSwitch = prevLangRef.current !== targetLanguage;
    prevLangRef.current = targetLanguage;

    if (isLangSwitch) {
      root.style.transition = "opacity 0.15s ease";
      root.style.opacity = "0";
    }

    let disposed = false;
    let mutationObserver: MutationObserver | null = null;
    let scheduleTimer: number | null = null;

    const getSnapshot = () => {
      const elements = Array.from(root.querySelectorAll<HTMLElement>(TEXT_TAGS));
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let currentNode = walker.nextNode();
      while (currentNode) {
        if (currentNode instanceof Text) {
          textNodes.push(currentNode);
        }
        currentNode = walker.nextNode();
      }
      return { elements, textNodes };
    };

    const restoreEnglish = () => {
      const { elements, textNodes } = getSnapshot();

      applyingRef.current = true;
      textNodes.forEach((node) => {
        const original = originalNodeText.get(node);
        if (original !== undefined) {
          node.textContent = original;
        }
      });

      elements.forEach((el) => {
        ATTRS.forEach((attr) => {
          const key = `atOrig${attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/^./, (c) => c.toUpperCase())}`;
          const original = (el.dataset as Record<string, string | undefined>)[key];
          if (original !== undefined) el.setAttribute(attr, original);
        });
      });
      applyingRef.current = false;
    };

    const fetchTranslations = async (texts: string[]) => {
      const { data, error } = await supabase.functions.invoke("auto-translate-ui", {
        body: { target: targetLanguage, texts },
      });

      if (error) throw error;
      return (data?.translations || {}) as Record<string, string>;
    };

    const fadeIn = () => {
      if (isLangSwitch) {
        requestAnimationFrame(() => {
          root.style.opacity = "1";
        });
      }
    };

    const run = async () => {
      if (disposed || applyingRef.current) return;

      if (targetLanguage === "en") {
        restoreEnglish();
        fadeIn();
        return;
      }

      const { elements, textNodes } = getSnapshot();

      const items: Array<
        | { node: Text; type: "text"; value: string }
        | { el: HTMLElement; type: "attr"; value: string; attr: (typeof ATTRS)[number] }
      > = [];

      textNodes.forEach((node) => {
        const parent = node.parentElement;
        if (!parent || parent.closest("[data-no-auto-translate='true']")) return;
        if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE"].includes(parent.tagName)) return;

        const original = originalNodeText.get(node) ?? (node.textContent || "").trim();
        if (shouldTranslate(original)) {
          if (!originalNodeText.has(node)) originalNodeText.set(node, original);
          items.push({ node, type: "text", value: original });
        }
      });

      elements.forEach((el) => {
        if (el.closest("[data-no-auto-translate='true']")) return;

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

      if (items.length === 0) { fadeIn(); return; }

      const applyTranslations = (cache: Record<string, string>) => {
        applyingRef.current = true;
        items.forEach((item) => {
          const value = item.value;
          const translated = cache[value] || value;
          if (item.type === "text") {
            item.node.textContent = translated;
          } else {
            item.el.setAttribute(item.attr, translated);
          }
        });
        applyingRef.current = false;
      };

      const cache = getCache(targetLanguage);
      applyTranslations(cache);

      const missing = [...new Set(items.map((i) => i.value))].filter((text) => !cache[text]);
      if (missing.length === 0) { fadeIn(); return; }

      let updated = false;

      for (let i = 0; i < missing.length; i += 50) {
        const chunk = missing.slice(i, i + 50);
        if (disposed) break;

        try {
          const translated = await fetchTranslations(chunk);
          Object.assign(cache, translated);
          updated = true;
        } catch {
          for (const text of chunk) {
            if (disposed) break;
            try {
              const translated = await fetchTranslations([text]);
              Object.assign(cache, translated);
              updated = true;
            } catch {
              // keep original text on hard failure
            }
          }
        }

        applyTranslations(cache);
      }

      if (updated) {
        setCache(targetLanguage, cache);
      }
      fadeIn();
    };

    const scheduleRun = () => {
      if (scheduleTimer) window.clearTimeout(scheduleTimer);
      scheduleTimer = window.setTimeout(() => {
        void run();
      }, 120);
    };

    scheduleRun();

    mutationObserver = new MutationObserver(() => {
      if (applyingRef.current || disposed || targetLanguage === "en") return;
      scheduleRun();
    });

    mutationObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });

    return () => {
      disposed = true;
      if (scheduleTimer) window.clearTimeout(scheduleTimer);
      mutationObserver?.disconnect();
      // Ensure body is visible if effect re-runs before fade completes
      root.style.opacity = "1";
    };
  }, [targetLanguage, location.pathname, location.search, location.hash]);

  return null;
}