// Site language: English by default, French and Portuguese on demand. The current language
// lives here too so non-React code (vault library logs and errors) can translate with tr().
import { en, type Key } from "./en";
import { fr } from "./fr";
import { pt } from "./pt";

export type { Key };
export type Lang = "en" | "fr" | "pt";
export const LANGS: { code: Lang; label: string; locale: string }[] = [
  { code: "en", label: "EN", locale: "en-US" },
  { code: "fr", label: "FR", locale: "fr-FR" },
  { code: "pt", label: "PT", locale: "pt-BR" },
];
const DICTS: Record<Lang, Record<Key, string>> = { en, fr, pt };

let current: Lang = "en";
export const currentLang = () => current;
export const setCurrentLang = (l: Lang) => { current = l; };
export const localeOf = (l: Lang) => LANGS.find((x) => x.code === l)!.locale;

export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  const s: string = DICTS[lang][key] ?? en[key];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Translate in the current language, for code outside React. */
export const tr = (key: Key, vars?: Vars) => translate(current, key, vars);
