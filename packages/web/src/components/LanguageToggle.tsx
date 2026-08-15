import { LANGS, type Lang } from '@hamscaler/shared';
import { LOCALES, useLang } from '../i18n';

/**
 * Language switcher. Renders nothing when only one locale is registered, so a fork that drops
 * the translation carries no dead control.
 */
export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  if (LANGS.length < 2) return null;

  return (
    <nav className="lang-toggle" aria-label={LOCALES[lang].language.label}>
      {LANGS.map((code: Lang) => (
        <button
          key={code}
          type="button"
          className={`lang-btn${code === lang ? ' is-active' : ''}`}
          // aria-pressed rather than aria-current: this is a toggle, not navigation within a
          // set of pages.
          aria-pressed={code === lang}
          onClick={() => setLang(code)}
        >
          {code.toUpperCase()}
          <span className="sr-only">{` — ${LOCALES[code].label}`}</span>
        </button>
      ))}
    </nav>
  );
}
