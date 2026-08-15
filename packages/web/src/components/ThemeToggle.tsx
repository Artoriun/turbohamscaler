import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { applyTheme, readTheme, type Theme } from '../lib/theme';

/**
 * Ported from TurboHamstarter so the two share a control.
 *
 * Monochrome icons rather than emoji. An emoji renders in the system's colour font, so it
 * ignores the theme entirely, differs between platforms, and cannot inherit the text colour —
 * these are strokes in `currentColor`, so they are ink on light and off-white on dark without
 * a second value to maintain.
 *
 * aria-hidden because the button already carries a label; without it a screen reader reads the
 * graphic as well as the label.
 */
function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export default function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const label = theme === 'light' ? t.theme.toDark : t.theme.toLight;

  return (
    <button
      type="button"
      onClick={() => {
        const next: Theme = theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        setTheme(next);
      }}
      className="theme-toggle"
      aria-label={label}
      title={label}
    >
      {theme === 'light' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
