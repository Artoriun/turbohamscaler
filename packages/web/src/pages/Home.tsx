import { APP_NAME } from '@hamscaler/shared';
import { Link } from 'react-router-dom';

/**
 * The public front of the site.
 *
 * Imports nothing from lib/api on purpose: a visitor who has never signed in should not cause
 * a request to the app's API, and keeping that boundary in the imports is what stops the
 * marketing page slowly acquiring app concerns.
 */

const FEATURES = [
  {
    title: 'Accounts that revoke',
    body: 'Sessions are rows, not tokens. Signing out everywhere actually ends every session, on every device — no waiting for a token to expire.',
  },
  {
    title: 'Organisations and roles',
    body: 'Members, admins and owners, with per-organisation data. Everyone starts in an organisation of their own and joins others by invitation.',
  },
  {
    title: 'Tenant isolation, proven',
    body: 'Every tenant query lives in one file and takes the organisation first. A test suite written from the attacker’s side proves the rows stay apart.',
  },
  {
    title: 'Migrations that refuse to drift',
    body: 'Applied in order and hashed, so editing one that has already run is an error rather than a database that quietly differs from everyone else’s.',
  },
  {
    title: 'Runs on nothing',
    body: 'No account, no container, no native build. Install, seed, and you have a working app with two organisations to poke at.',
  },
  {
    title: 'A pipeline that fails loudly',
    body: 'Lint, types, tenancy guards, unit and API tests, a bundle budget, and the browser suite run twice — against the dev server and the built output.',
  },
];

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">TurboRepo starter</p>
          <h1>
            The boring half of a multi-tenant app, <em>already done</em>.
          </h1>
          <p className="lede">
            {APP_NAME} gives you accounts, organisations, roles and per-tenant data — with the
            isolation checks that keep them honest. Clone it and start on the part that is actually
            yours.
          </p>
          <div className="cta">
            <Link className="button" to="/app">
              Open the demo
            </Link>
            <a
              className="button ghost"
              href="https://github.com/Artoriun/turbohamscaler"
              rel="noreferrer"
            >
              Read the source
            </a>
          </div>
          <p className="muted small">
            Demo sign-in: <code>ada@example.com</code> · <code>hamster-wheel-9000</code>
          </p>
        </div>
        <span
          className="mascot mascot-lg hero-mascot"
          role="img"
          aria-label="TurboHam, the pixel dwarf hamster mascot in teal headphones"
        />
      </section>

      <section className="features">
        <h2>What you get</h2>
        <div className="grid">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="start">
        <h2>Start in three commands</h2>
        <pre>
          <code>{'npm install\nnpm run db:seed\nnpm run dev'}</code>
        </pre>
        <p className="muted">
          Two organisations are seeded on purpose. Sign in as one and the other’s data is simply not
          there — which is the whole point.
        </p>
      </section>
    </>
  );
}
