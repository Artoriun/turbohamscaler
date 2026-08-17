import { DEFAULT_LANG, LANGS, type Lang } from '@hamscaler/shared';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { type Dictionary, en } from './en';
import { ja } from './ja';

/**
 * Translations without an i18n dependency, ported from TurboHamstarter.
 *
 * ── Adding a language ──────────────────────────────────────────────────────
 *   1. Add its code to LANGS in packages/shared.
 *   2. Copy `ja.ts`, translate the values, keep the `: Dictionary` annotation.
 *   3. Add it to LOCALES below.
 *
 * Steps 1 and 3 are checked against each other by the `satisfies` on LOCALES, and the
 * annotation in step 2 makes a missing key a type error — so a half-finished language fails
 * `npm run typecheck` rather than rendering blanks in production.
 */
export const LOCALES = { en, ja } satisfies Record<Lang, Dictionary>;

/**
 * The language is read from the path — /ja, /ja/app — not from a query or navigator.language.
 *
 * A query string is not part of what a static host serves, so `?lang=ja` cannot ever have its
 * own page; guessing from the browser makes the same URL show different languages to different
 * people, which is worse than either for anything shared or linked. A path prefix is a real,
 * linkable address, and it is what TurboHamstarter uses — there it also earns each language its
 * own prerendered file.
 */
export function resolveLang(pathname = ''): Lang {
  const match = pathname.match(new RegExp(`(?:^|/)(${LANGS.join('|')})(?=/|$)`));
  return (match?.[1] as Lang) ?? DEFAULT_LANG;
}

/** The path with any language prefix removed, always starting with a slash. */
export function stripLang(pathname: string): string {
  const rest = pathname.replace(new RegExp(`^/(${LANGS.join('|')})(?=/|$)`), '');
  return rest || '/';
}

/** A path in the given language: the default language lives at the root, others under /code. */
export function pathFor(lang: Lang, pathname: string): string {
  const rest = stripLang(pathname);
  return lang === DEFAULT_LANG ? rest : `/${lang}${rest === '/' ? '' : rest}`;
}

interface LanguageValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Dictionary;
}

const LanguageContext = createContext<LanguageValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const lang = resolveLang(location.pathname);

  // Switching language is a navigation, not a state change: the URL is what decides the
  // language, so changing the strings without changing the address would leave a page nobody
  // could link to or reload.
  const setLang = useCallback(
    (next: Lang) => navigate(pathFor(next, location.pathname)),
    [navigate, location.pathname],
  );

  // Keep <html lang> in step. Screen readers pick pronunciation from it and search engines
  // read it as the page's language, so Japanese served under lang="en" is announced with
  // English phonetics and indexed as English.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<LanguageValue>(
    () => ({ lang, setLang, t: LOCALES[lang] }),
    [lang, setLang],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function useLanguageContext(): LanguageValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useT must be used inside a LanguageProvider');
  return ctx;
}

/** The strings for the active language. */
export function useT(): Dictionary {
  return useLanguageContext().t;
}

/** The active language and a setter, for the switcher. */
/**
 * Dates and times, in the language the page is being read in.
 *
 * `toLocaleString()` with no locale follows the browser, so a reader who had switched the page
 * to Japanese still got 8/17/2026 — the app's own language switch had no effect on half the
 * values on the screen. The tag comes from the same place every other translated string does.
 */
export function useFormat(): {
  date: (ms: number) => string;
  dateTime: (ms: number) => string;
} {
  const { lang } = useLanguageContext();
  return useMemo(
    () => ({
      date: (ms: number) => new Date(ms).toLocaleDateString(lang),
      dateTime: (ms: number) => new Date(ms).toLocaleString(lang),
    }),
    [lang],
  );
}

export function useLang(): { lang: Lang; setLang: (lang: Lang) => void } {
  const { lang, setLang } = useLanguageContext();
  return { lang, setLang };
}

/** Fills `{name}`-style placeholders. One interpolation helper beats a dependency. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}
