import { Link, useLocation } from 'react-router-dom';
import Mascot from '../components/Mascot';
import { pathFor, resolveLang, useT } from '../i18n';

export default function NotFound() {
  const t = useT();
  const lang = resolveLang(useLocation().pathname);

  return (
    <section className="centre-block">
      {/* Room for the full animation here, unlike the header. */}
      <Mascot art="evolution" className="hero-mascot" width={210} height={203} alt="" />
      <h1>{t.notFound.title}</h1>
      <p className="muted">{t.notFound.body}</p>
      <Link className="button" to={pathFor(lang, '/')}>
        {t.notFound.back}
      </Link>
    </section>
  );
}
