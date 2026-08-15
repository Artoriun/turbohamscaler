import { Link, useLocation } from 'react-router-dom';
import mascot from '../assets/turboham-evolution.gif';
import { pathFor, resolveLang, useT } from '../i18n';

/**
 * The public front of the site.
 *
 * Imports nothing from lib/api on purpose: a visitor who has never signed in should not cause
 * a request to the app's API, and keeping that boundary visible in the imports is what stops
 * the marketing page slowly acquiring app concerns.
 */
export default function Home() {
  const t = useT();
  const lang = resolveLang(useLocation().pathname);

  const features = [
    t.home.features.accounts,
    t.home.features.orgs,
    t.home.features.isolation,
    t.home.features.migrations,
    t.home.features.nothing,
    t.home.features.pipeline,
  ];

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">{t.home.eyebrow}</p>
          <h1>
            {t.home.headline} <em>{t.home.headlineAccent}</em>.
          </h1>
          <p className="lede">{t.home.lede}</p>
          <div className="cta">
            <Link className="button" to={pathFor(lang, '/app')}>
              {t.home.openDemo}
            </Link>
            <a
              className="button ghost"
              href="https://github.com/Artoriun/turbohamscaler"
              rel="noreferrer"
            >
              {t.home.readSource}
            </a>
          </div>
          <p className="muted small">
            {t.home.demoSignIn} <code>ada@example.com</code> · <code>hamster-wheel-9000</code>
          </p>
        </div>
        <img
          className="hero-mascot"
          src={mascot}
          // Intrinsic size stated so the browser reserves the space before the GIF loads;
          // without it the hero reflows around it once it arrives and the heading jumps.
          width={280}
          height={271}
          alt="TurboHam evolving: the pixel hamster in teal headphones flashes white and grows, twice, ending as a broad-shouldered ogre with a heavy brow and a smirk"
        />
      </section>

      <section className="features">
        <h2>{t.home.whatYouGet}</h2>
        <div className="grid">
          {features.map((f) => (
            <article key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="start">
        <h2>{t.home.startHeading}</h2>
        <pre>
          <code>{'npm install\nnpm run db:seed\nnpm run dev'}</code>
        </pre>
        <p className="muted">{t.home.startNote}</p>
      </section>
    </>
  );
}
