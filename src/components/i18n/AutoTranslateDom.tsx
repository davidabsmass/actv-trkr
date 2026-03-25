import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

const TEXT_TAGS = "h1,h2,h3,h4,h5,h6,p,span,button,a,label,th,td,option,small,strong,em,li";
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const originalNodeText = new WeakMap<Text, string>();

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
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode instanceof Text) {
        textNodes.push(currentNode);
      }
      currentNode = walker.nextNode();
    }

    const restoreEnglish = () => {
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
    };

    if (targetLanguage === "en") {
      restoreEnglish();
      return;
    }

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

    if (items.length === 0) return;

    const applyTranslations = (cache: Record<string, string>) => {
      items.forEach((item) => {
        const value = item.value;
        const translated = cache[value] || value;
        if (item.type === "text") {
          item.node.textContent = translated;
        } else {
          item.el.setAttribute(item.attr, translated);
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
  }, [targetLanguage, location.pathname, location.search]);

  return null;
}