import { APP_NAME, type OrganisationMembership, type Project, type Role } from '@hamscaler/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import mark from '../assets/turboham-mark.gif';
import LanguageToggle from '../components/LanguageToggle';
import ThemeToggle from '../components/ThemeToggle';
import { fill, pathFor, resolveLang, useT } from '../i18n';
import {
  ApiError,
  apiCreateProject,
  apiDeleteProject,
  apiMe,
  apiMembers,
  apiProjects,
  apiSignIn,
  apiSignOut,
  apiSignUp,
  SIGNED_OUT_EVENT,
} from '../lib/api';

/**
 * The signed-in app: pick an organisation and work inside it.
 *
 * Everything here is behind a session. The public site that fronts it is pages/Home.tsx, and
 * the two are deliberately separate — a marketing page has no business importing the API
 * client, and this has no business rendering a hero.
 *
 * Kept to one file. The starter's value is underneath — tenancy, sessions, migrations, the
 * checks — and a reader should see the whole UI without navigating a component tree that
 * exists mostly to demonstrate structure.
 */
export default function Portal() {
  const t = useT();
  const [session, setSession] = useState<{ organisations: OrganisationMembership[] } | null>(null);
  const [orgId, setOrgId] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasApi, setHasApi] = useState(true);

  const load = useCallback(async () => {
    try {
      const me = await apiMe();
      setSession(me);
      setOrgId((current) => current || (me.organisations[0]?.id ?? ''));
      setHasApi(true);
    } catch (err) {
      setSession(null);
      // Whether an API exists is decided by the answer, not by a build-time flag. A 401 is a
      // server saying "not you" — proof one is there. Anything else (a static host's 404 for
      // an unknown path, a refused connection) means there is nothing behind this copy.
      //
      // Done at runtime because the alternative needs VITE_API_URL set at build time, which
      // is both a knob to forget and wrong for the common case of a reverse proxy serving the
      // app and the API on one origin.
      setHasApi(err instanceof ApiError && err.status === 401);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onSignedOut = () => {
      setSession(null);
      setOrgId('');
    };
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
  }, []);

  if (loading) {
    return (
      <main className="centre">
        <p className="muted">{t.portal.loading}</p>
      </main>
    );
  }
  if (!hasApi) return <NoApi />;
  if (!session) {
    return (
      <>
        <div className="floating-controls">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <SignIn onDone={load} />
      </>
    );
  }

  const org = session.organisations.find((o) => o.id === orgId);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to="/">
            <img className="brand-mark" src={mark} width={48} height={32} alt="" />
            {APP_NAME}
          </Link>
          <label className="org-picker">
            <span className="sr-only">{t.portal.organisation}</span>
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              aria-label={t.portal.organisation}
            >
              {session.organisations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          {org ? <RoleBadge role={org.role} /> : null}
          <LanguageToggle />
          <ThemeToggle />
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              await apiSignOut();
              setSession(null);
            }}
          >
            {t.auth.signOut}
          </button>
        </div>
      </header>

      <main className="page">
        {org ? (
          <>
            <div className="page-head">
              <h1>{org.name}</h1>
              <p className="muted">
                {org.role === 'owner'
                  ? t.portal.ownerOf
                  : fill(t.portal.memberOf, { role: org.role })}
              </p>
            </div>
            <div className="columns">
              <Projects orgId={org.id} canDelete={org.role !== 'member'} />
              <Members orgId={org.id} />
            </div>
          </>
        ) : null}
      </main>
    </>
  );
}

/**
 * Shown where the app is served without an API — the GitHub Pages deploy, for instance.
 *
 * A sign-in form that cannot succeed is worse than no form: it looks broken rather than
 * unconfigured, and the visitor has no way to tell which.
 */
function NoApi() {
  const t = useT();
  return (
    <main className="centre">
      <section className="panel auth">
        <span className="mascot mascot-md" aria-hidden="true" />
        <h1>{t.portal.noApiTitle}</h1>
        <p className="muted">{t.portal.noApiBody}</p>
        <p className="muted">{t.portal.noApiRun}</p>
        <pre>
          <code>{'npm install\nnpm run db:seed\nnpm run dev'}</code>
        </pre>
        <Link className="button" to="/">
          {t.portal.backToOverview}
        </Link>
      </section>
    </main>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge badge-${role}`}>{role}</span>;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'in') await apiSignIn(email, password);
      else await apiSignUp(email, name, password);
      onDone();
    } catch (err) {
      // The API answers a wrong address and a wrong password identically; saying more here
      // would undo that.
      setError(
        err instanceof ApiError && err.code === 'weak-password'
          ? t.auth.weakPassword
          : err instanceof ApiError && err.code === 'email-taken'
            ? t.auth.emailTaken
            : mode === 'in'
              ? t.auth.rejected
              : t.auth.couldNotCreate,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centre">
      <form className="panel auth" onSubmit={submit}>
        <span className="mascot mascot-md" aria-hidden="true" />
        <h1>{mode === 'in' ? t.auth.signIn : t.auth.createAccount}</h1>
        <p className="muted">{mode === 'in' ? t.auth.signInNote : t.auth.signUpNote}</p>
        <label>
          {t.auth.email}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        {mode === 'up' ? (
          <label>
            {t.auth.name}
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        ) : null}
        <label>
          {t.auth.password}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required
          />
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy}>
          {busy ? t.auth.working : mode === 'in' ? t.auth.signIn : t.auth.createAccountAction}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? t.auth.switchToSignUp : t.auth.switchToSignIn}
        </button>
      </form>
    </main>
  );
}

function Projects({ orgId, canDelete }: { orgId: string; canDelete: boolean }) {
  const t = useT();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { projects: list } = await apiProjects(orgId);
    setProjects(list);
  }, [orgId]);

  useEffect(() => {
    setProjects(null);
    void refresh();
  }, [refresh]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{t.portal.projects}</h2>
        {projects ? <span className="count">{projects.length}</span> : null}
      </div>

      <form
        className="row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          try {
            await apiCreateProject(orgId, name.trim());
            setName('');
            await refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="grow">
          <span className="sr-only">{t.portal.newProjectLabel}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.portal.newProject}
            aria-label={t.portal.newProjectLabel}
          />
        </label>
        <button type="submit" disabled={busy}>
          {t.portal.add}
        </button>
      </form>

      {projects === null ? (
        <p className="muted">{t.portal.loading}</p>
      ) : projects.length === 0 ? (
        <p className="empty">{t.portal.noProjects}</p>
      ) : (
        <ul className="list">
          {projects.map((p) => (
            <li key={p.id}>
              <div className="grow">
                <span className="title">{p.name}</span>
                <span className="meta">{new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
              {canDelete ? (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    await apiDeleteProject(orgId, p.id);
                    await refresh();
                  }}
                  aria-label={fill(t.portal.deleteNamed, { name: p.name })}
                >
                  {t.portal.delete}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Members({ orgId }: { orgId: string }) {
  const t = useT();
  const [members, setMembers] = useState<{ id: string; name: string; email: string; role: Role }[]>(
    [],
  );

  useEffect(() => {
    let live = true;
    void apiMembers(orgId).then(({ members: list }) => {
      if (live) setMembers(list);
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{t.portal.members}</h2>
        <span className="count">{members.length}</span>
      </div>
      <ul className="list">
        {members.map((m) => (
          <li key={m.id}>
            <div className="grow">
              <span className="title">{m.name}</span>
              <span className="meta">{m.email}</span>
            </div>
            <RoleBadge role={m.role} />
          </li>
        ))}
      </ul>
      <p className="muted small">{t.portal.rolesNote}</p>
    </section>
  );
}
