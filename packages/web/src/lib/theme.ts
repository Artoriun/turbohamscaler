/**
 * Light/dark preference.
 *
 * Three states, not two: `system` is a real choice and the default, so a visitor who has never
 * touched the toggle follows their operating system and changes with it. Only `light` and
 * `dark` write a class, which is what lets the media query in styles.css stay in charge until
 * somebody overrides it deliberately.
 *
 * The same logic runs twice — here, and inline in index.html before first paint. That
 * duplication is the price of not showing a flash of the wrong theme; keep them in step.
 */

export type Theme = 'light' | 'dark' | 'system';

export const THEME_KEY = 'theme';

export function readTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  if (theme === 'system') localStorage.removeItem(THEME_KEY);
  else localStorage.setItem(THEME_KEY, theme);
}

/** What the page is actually showing, which for `system` depends on the OS. */
export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The next theme in the cycle: whatever is showing now, flipped, then back to following the OS. */
export function nextTheme(theme: Theme): Theme {
  if (theme === 'system') return resolvedTheme('system') === 'dark' ? 'light' : 'dark';
  return 'system';
}
