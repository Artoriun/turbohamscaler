import { useEffect, useState } from 'react';
import { applyTheme, nextTheme, readTheme, resolvedTheme, type Theme } from '../lib/theme';

/**
 * Cycles light → dark → follow the system.
 *
 * The label says what the button will do, not what the theme currently is: a control named
 * after its own state reads as a status display and leaves people guessing what pressing it
 * does.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  // While following the system, track it live — someone switching their OS to dark at sunset
  // should see this page follow without a reload.
  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  const showing = resolvedTheme(theme);
  const next = nextTheme(theme);
  const label =
    next === 'system' ? 'Follow system theme' : next === 'dark' ? 'Dark theme' : 'Light theme';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        const value = nextTheme(theme);
        applyTheme(value);
        setTheme(value);
      }}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{theme === 'system' ? '◐' : showing === 'dark' ? '☾' : '☀'}</span>
    </button>
  );
}
