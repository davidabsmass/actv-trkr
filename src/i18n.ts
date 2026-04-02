import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en/common.json";
import es from "./locales/es/common.json";
import fr from "./locales/fr/common.json";
import pt from "./locales/pt/common.json";
import de from "./locales/de/common.json";
import it from "./locales/it/common.json";
import zh from "./locales/zh/common.json";
import ja from "./locales/ja/common.json";
import ko from "./locales/ko/common.json";
import ar from "./locales/ar/common.json";

const supportedLanguages = new Set(["en", "es", "fr", "pt", "de", "it", "zh", "ja", "ko", "ar"]);

const getInitialLanguage = () => {
  try {
    const stored = window.localStorage.getItem("at_language")?.split("-")[0];
    if (stored && supportedLanguages.has(stored)) return stored;
  } catch {
    // ignore storage access issues
  }

  const browser = typeof navigator !== "undefined" ? navigator.language.split("-")[0] : "en";
  return supportedLanguages.has(browser) ? browser : "en";
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      pt: { translation: pt },
      de: { translation: de },
      it: { translation: it },
      zh: { translation: zh },
      ja: { translation: ja },
      ko: { translation: ko },
      ar: { translation: ar },
    },
    lng: getInitialLanguage(),
    fallbackLng: "en",
    supportedLngs: [...supportedLanguages],
    load: "languageOnly",
    initImmediate: false,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "at_language",
    },
  });

export default i18n;