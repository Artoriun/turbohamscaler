import { APP_NAME, DEFAULT_LANG, LANGS } from '@hamscaler/shared';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import mark from './assets/turboham-mark.gif';
import LanguageToggle from './components/LanguageToggle';
import ThemeToggle from './components/ThemeToggle';
import { LanguageProvider, pathFor, resolveLang, useT } from './i18n';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Portal from './pages/Portal';

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
          <Route key={prefix || 'root'} path={`${prefix}/app`} element={<Portal />} />
        ))}
        <Route
          path="*"
          element={
            <PublicLayout>
              <Routes>
                {PREFIXES.map((prefix) => (
                  <Route key={prefix || 'root'} path={`${prefix}/`} element={<Home />} />
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
            <img className="brand-mark" src={mark} width={48} height={32} alt="" />
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

      <footer className="footer">
        <div className="footer-inner">
          <span>{t.home.footer}</span>
          <a href="https://github.com/Artoriun/turbohamscaler" rel="noreferrer">
            {t.nav.sourceOnGitHub}
          </a>
        </div>
      </footer>
    </>
  );
}
