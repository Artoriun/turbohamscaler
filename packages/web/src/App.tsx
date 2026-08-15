import { APP_NAME } from '@hamscaler/shared';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import ThemeToggle from './components/ThemeToggle';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Portal from './pages/Portal';

/**
 * Routing, and the chrome the public pages share.
 *
 * `/app` renders its own header — it needs the organisation switcher and the signed-in
 * identity, which mean nothing on a marketing page — so it sits outside the public layout
 * rather than inheriting a nav it would have to override.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/app" element={<Portal />} />
      <Route
        path="*"
        element={
          <PublicLayout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PublicLayout>
        }
      />
    </Routes>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/">
            <span className="mascot mascot-sm" aria-hidden="true" />
            {APP_NAME}
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              Overview
            </NavLink>
            <a href="https://github.com/Artoriun/turbohamscaler" rel="noreferrer">
              Source
            </a>
          </nav>
          <ThemeToggle />
          <Link className="button" to="/app">
            Open the app
          </Link>
        </div>
      </header>

      <main className="page">{children}</main>

      <footer className="footer">
        <div className="footer-inner">
          <span>
            {APP_NAME} — a TurboRepo starter for multi-tenant apps. Every service it needs has a
            free tier, so the running cost is a hamster-appropriate zero.
          </span>
          <a href="https://github.com/Artoriun/turbohamscaler" rel="noreferrer">
            Source on GitHub
          </a>
        </div>
      </footer>
    </>
  );
}
