"use client";

// Language context: the choice is remembered in this browser (a convenience; English if storage is unavailable).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LANGS, localeOf, setCurrentLang, translate, type Key, type Lang, type Vars } from "./index";

const STORAGE = "monolith.lang";

type Ctx = { lang: Lang; locale: string; setLang: (l: Lang) => void; t: (key: Key, vars?: Vars) => string };
const I18n = createContext<Ctx>({ lang: "en", locale: "en-US", setLang: () => {}, t: (k, v) => translate("en", k, v) });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved && LANGS.some((l) => l.code === saved)) setLangState(saved as Lang);
    } catch { /* storage blocked: stay in English */ }
  }, []);

  useEffect(() => {
    setCurrentLang(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setCurrentLang(l);
    setLangState(l);
    try { localStorage.setItem(STORAGE, l); } catch { /* not remembered */ }
  }, []);

  const value = useMemo<Ctx>(() => ({ lang, locale: localeOf(lang), setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t("lang.label")}>
      {LANGS.map((l) => (
        <button key={l.code} type="button" aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>
          {l.label}
        </button>
      ))}
    </div>
  );
}
