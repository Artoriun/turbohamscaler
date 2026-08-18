import Mascot from '../components/Mascot';
import { useLang } from '../i18n';
import { PRIVACY } from './privacy.copy';

/**
 * What this app stores, in the words of somebody who read the schema.
 *
 * Written against `packages/api/src/db/*.sql` rather than adapted from the sibling starter's
 * page, which says the site sets no cookies and keeps no accounts. Both are true there and
 * neither is true here: this one is an app you sign into, so it has a session cookie, a users
 * table and an audit log that deliberately outlives its subject.
 *
 * A privacy page on a starter is a template with a worked example in it. Anybody deploying this
 * has to check it still describes what their copy does — the note at the end says so, because a
 * page like this is only worth anything if it is accurate.
 */
export default function Privacy() {
  // Its own copy, loaded with this chunk rather than with every page. See privacy.copy.ts.
  const { lang } = useLang();
  const t = { privacy: PRIVACY[lang] };

  return (
    <div className="prose">
      <h1>{t.privacy.title}</h1>
      <p className="lede">{t.privacy.lede}</p>

      <h2>{t.privacy.cookieHeading}</h2>
      <p>{t.privacy.cookieBody}</p>

      <h2>{t.privacy.storedHeading}</h2>
      <p>{t.privacy.storedBody}</p>
      <ul>
        <li>{t.privacy.storedAccount}</li>
        <li>{t.privacy.storedWork}</li>
        <li>{t.privacy.storedSessions}</li>
        <li>{t.privacy.storedAudit}</li>
      </ul>

      <h2>{t.privacy.logsHeading}</h2>
      <p>{t.privacy.logsBody}</p>

      <h2>{t.privacy.emailHeading}</h2>
      <p>{t.privacy.emailBody}</p>

      <h2>{t.privacy.thirdPartiesHeading}</h2>
      <p>{t.privacy.thirdPartiesBody}</p>

      <h2>{t.privacy.deleteHeading}</h2>
      <p>{t.privacy.deleteBody}</p>

      <aside className="notice">
        <Mascot art="mark" className="notice-mascot" width={48} height={32} alt="" />
        <p>{t.privacy.demoNote}</p>
      </aside>

      <p className="muted small">{t.privacy.forkNote}</p>
    </div>
  );
}
