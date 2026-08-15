/**
 * Light/dark preference, matching TurboHamstarter: two states, light by default, stored under
 * `theme` and applied as `dark-mode` on <html>.
 *
 * Light rather than the operating system's preference, deliberately — the palette is built
 * from a light design, and following the OS would mean the default look depends on who is
 * looking. The toggle is how you get the other one, and the choice sticks.
 *
 * The same logic runs twice — here, and inline in index.html before first paint. That
 * duplication is the price of not flashing the wrong theme on the way in; keep them in step.
 */

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'theme';

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    // Private mode can refuse localStorage; light is the documented default.
    return 'light';
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark-mode', theme === 'dark');
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Nothing to do — the class is applied either way, it just will not survive a reload.
  }
}
