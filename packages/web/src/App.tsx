import { APP_NAME, DEFAULT_LANG, LANGS } from '@hamscaler/shared';
import { lazy, Suspense } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import LanguageToggle from './components/LanguageToggle';
import Mascot from './components/Mascot';
import ThemeToggle from './components/ThemeToggle';
import { LanguageProvider, pathFor, resolveLang, useT } from './i18n';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

/**
 * Loaded on demand, not with the public pages.
 *
 * The portal is the larger half of this app — members, invitations, the audit log, organisation
 * and account settings — and none of it means anything to a visitor reading the marketing page.
 * Shipping it in the initial payload put the public page over its bundle budget, which is
 * exactly what that budget is for: the fix is to stop sending it, not to raise the number.
 */
const Portal = lazy(() => import('./pages/Portal'));

/**
 * Also loaded on demand. It is a page of prose that almost nobody opens, and shipping it with
 * the marketing page put the initial payload over its budget — which is what the budget is for.
 * Prerendering still writes it out with its text in the markup, because that happens in a real
 * browser that waits for the chunk.
 */
const Privacy = lazy(() => import('./pages/Privacy'));

/**
 * Routing, and the chrome the public pages share.
 *
 * Every route is registered twice: once at the root for the default language and once under a
 * `/:lang` prefix. That is what makes a Japanese page a real address someone can link to or
 * reload, rather than a state the app happens to be in.
 *
 * `/app` renders its own header — it needs the organisation switcher and the signed-in
 * identity, which mean nothing on a marketing page — so it sits outside the public layout
 * rather than inheriting a nav it would have to override.
 */
const PREFIXES = ['', ...LANGS.filter((l) => l !== DEFAULT_LANG).map((l) => `/${l}`)];

export default function App() {
  return (
    <LanguageProvider>
      <Routes>
        {PREFIXES.map((prefix) => (
          <Route
            key={prefix || 'root'}
            path={`${prefix}/app`}
            // No visible fallback: the portal shows its own loading state as soon as it mounts,
            // and a second spinner before that one only adds a flash of different furniture.
            element={
              <Suspense fallback={null}>
                <Portal />
              </Suspense>
            }
          />
        ))}
        <Route
          path="*"
          element={
            <PublicLayout>
              <Routes>
                {PREFIXES.map((prefix) => (
                  <Route key={prefix || 'root'} path={`${prefix}/`} element={<Home />} />
                ))}
                {PREFIXES.map((prefix) => (
                  <Route
                    key={`${prefix || 'root'}-privacy`}
                    path={`${prefix}/privacy`}
                    element={
                      <Suspense fallback={null}>
                        <Privacy />
                      </Suspense>
                    }
                  />
                ))}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </PublicLayout>
          }
        />
      </Routes>
    </LanguageProvider>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { pathname } = useLocation();
  // Built from the current path, so following a link keeps you in the language you are reading.
  const lang = resolveLang(pathname);
  const home = pathFor(lang, '/');
  const app = pathFor(lang, '/app');

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to={home} aria-label={APP_NAME}>
            <Mascot art="mark" className="brand-mark" width={48} height={32} alt="" />
            <span className="brand-name">{APP_NAME}</span>
          </Link>
          <nav className="nav">
            <NavLink to={home} end>
              {t.nav.overview}
            </NavLink>
            <a href="https://github.com/Artoriun/turbohamscaler" rel="noreferrer">
              {t.nav.source}
            </a>
          </nav>
          <LanguageToggle />
          <ThemeToggle />
          <Link className="button" to={app}>
            {t.nav.openApp}
          </Link>
        </div>
      </header>

      <main className="page">{children}</main>

      {/* Centred and stacked, the same shape TurboHamstarter uses. The previous one was a flex
          row that let the description take the whole line and then sat "Privacy" beside its last
          word, with the GitHub link orphaned underneath — which on a phone read as a mistake
          rather than a footer. */}
      <footer className="site-footer">
        <p>{t.home.footer}</p>
        <nav className="footer-links" aria-label={t.nav.footerLinks}>
          <Link to={pathFor(lang, '/privacy')}>{t.nav.privacy}</Link>
          <a href="https://github.com/Artoriun/turbohamscaler" rel="noreferrer">
            {t.nav.sourceOnGitHub}
          </a>
        </nav>
      </footer>
    </>
  );
}
