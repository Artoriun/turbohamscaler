import {
  APP_NAME,
  type AuditEvent,
  type Invitation,
  type Organisation,
  type OrganisationMembership,
  type Project,
  ROLES,
  type Role,
} from '@hamscaler/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import LanguageToggle from '../components/LanguageToggle';
import Mascot from '../components/Mascot';
import ThemeToggle from '../components/ThemeToggle';
import { fill, pathFor, resolveLang, useT } from '../i18n';
import {
  ApiError,
  apiAcceptInvitation,
  apiAudit,
  apiCreateProject,
  apiDeleteProject,
  apiInvitations,
  apiInvite,
  apiMe,
  apiMembers,
  apiOpenInvitation,
  apiProjects,
  apiRemoveMember,
  apiRevokeInvitation,
  apiSetMemberRole,
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
  // Bumped when a membership changes, so the log below reflects it without a reload.
  const [activityKey, setActivityKey] = useState(0);
  // Both ways out of the portal have to keep the reader's language. Hardcoding "/" sent someone
  // reading /ja/app to the English overview, which is a one-way door: nothing on the page they
  // land on tells them they were switched, or how to get back.
  const home = pathFor(resolveLang(useLocation().pathname), '/');

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
  // Both screens below stand alone, without the portal's header — so the controls that live in
  // that header have to come with them, or a visitor who lands here has no way to change
  // language or theme. The no-API screen is what the static deploy always shows, so it needs
  // them most.
  if (!hasApi || !session) {
    return (
      <>
        <div className="floating-controls">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        {hasApi ? <SignIn onDone={load} /> : <NoApi />}
      </>
    );
  }

  const org = session.organisations.find((o) => o.id === orgId);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link className="brand" to={home} aria-label={APP_NAME}>
            <Mascot art="mark" className="brand-mark" width={48} height={32} alt="" />
            <span className="brand-name">{APP_NAME}</span>
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
        <AcceptInvitation onJoined={load} />
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
              <Members
                orgId={org.id}
                canInvite={org.role !== 'member'}
                myRole={org.role}
                onChanged={() => {
                  load();
                  setActivityKey((k) => k + 1);
                }}
              />
            </div>
            {org.role !== 'member' ? <Activity orgId={org.id} reloadKey={activityKey} /> : null}
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
  const home = pathFor(resolveLang(useLocation().pathname), '/');
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
        <Link className="button" to={home}>
          {t.portal.backToOverview}
        </Link>
      </section>
    </main>
  );
}

/**
 * Shown when the portal is opened with ?invite=… on the URL — the link an admin hands out.
 *
 * Deliberately a prompt rather than an automatic join: arriving at a link should not silently
 * change which organisations you belong to. The token is dropped from the address bar either
 * way, so a refresh or a shared URL does not carry it any further.
 */
function AcceptInvitation({ onJoined }: { onJoined: () => void }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const token = params.get('invite');
  const [offer, setOffer] = useState<{ invitation: Invitation; organisation: Organisation } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const dismiss = useCallback(() => {
    const next = new URLSearchParams(params);
    next.delete('invite');
    setParams(next, { replace: true });
    setOffer(null);
  }, [params, setParams]);

  useEffect(() => {
    if (!token) return;
    let live = true;
    apiOpenInvitation(token)
      .then((o) => {
        if (live) setOffer(o);
      })
      .catch(() => {
        if (live) setError(t.portal.joinGone);
      });
    return () => {
      live = false;
    };
  }, [token, t.portal.joinGone]);

  if (!token) return null;
  if (error) {
    return (
      <section className="panel notice">
        <p>{error}</p>
        <button type="button" className="ghost" onClick={dismiss}>
          {t.portal.joinDecline}
        </button>
      </section>
    );
  }
  if (!offer) return null;

  return (
    <section className="panel notice">
      <h2>{fill(t.portal.joinHeading, { org: offer.organisation.name })}</h2>
      <p className="muted">{fill(t.portal.joinBody, { role: offer.invitation.role })}</p>
      <div className="row">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await apiAcceptInvitation(token);
              dismiss();
              onJoined();
            } catch (err) {
              setError(
                err instanceof ApiError && err.status === 403
                  ? t.portal.joinWrongAccount
                  : t.portal.joinGone,
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t.auth.working : t.portal.joinAccept}
        </button>
        <button type="button" className="ghost" onClick={dismiss}>
          {t.portal.joinDecline}
        </button>
      </div>
    </section>
  );
}

/**
 * What has happened in this organisation, newest first.
 *
 * Each line is rendered from the action name through the dictionary, so the log reads in the
 * viewer's language while what is stored stays a stable identifier rather than a sentence in
 * whatever language the person who caused it happened to be using.
 */
function Activity({ orgId, reloadKey }: { orgId: string; reloadKey: number }) {
  const t = useT();
  const [events, setEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    let live = true;
    apiAudit(orgId)
      .then(({ events: list }) => {
        if (live) setEvents(list);
      })
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
      });
    return () => {
      live = false;
    };
  }, [orgId, reloadKey]);

  const describe = (e: AuditEvent) => {
    const template = t.portal.action[e.action as keyof typeof t.portal.action];
    return template ? fill(template, { subject: e.subject }) : `${e.action} ${e.subject}`;
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{t.portal.activity}</h2>
        <span className="count">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <p className="empty">{t.portal.activityNone}</p>
      ) : (
        <ul className="list">
          {events.map((e) => (
            <li key={e.id}>
              <div className="grow">
                <span className="title">
                  {describe(e)}
                  {e.detail ? <span className="detail"> ({e.detail})</span> : null}
                </span>
                <span className="meta">
                  {fill(t.portal.activityBy, { who: e.actorLabel })} ·{' '}
                  <time dateTime={new Date(e.createdAt).toISOString()}>
                    {new Date(e.createdAt).toLocaleString()}
                  </time>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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

function Members({
  orgId,
  canInvite,
  myRole,
  onChanged,
}: {
  orgId: string;
  canInvite: boolean;
  myRole: Role;
  onChanged: () => void;
}) {
  const t = useT();
  const [members, setMembers] = useState<{ id: string; name: string; email: string; role: Role }[]>(
    [],
  );
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    void apiMembers(orgId).then(({ members: list }) => {
      if (live) setMembers(list);
    });
    return () => {
      live = false;
    };
  }, [orgId]);

  // The same handling for both changes: the server owns the rules — an admin may not outrank
  // itself, and the last owner may not be demoted or removed — so the client asks and reports
  // what it is told rather than keeping a second copy of them that can disagree.
  const apply = (work: Promise<{ members: (typeof members)[number][] }>) => {
    setError('');
    work
      .then(({ members: list }) => {
        setMembers(list);
        onChanged();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'last-owner') setError(t.portal.lastOwner);
        else if (err instanceof ApiError && err.status !== 401)
          setError(t.portal.memberChangeFailed);
      });
  };

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
            {canInvite ? (
              <>
                <label className="sr-only" htmlFor={`role-${m.id}`}>
                  {fill(t.portal.memberRole, { name: m.name })}
                </label>
                <select
                  id={`role-${m.id}`}
                  className="role-select"
                  value={m.role}
                  onChange={(e) => apply(apiSetMemberRole(orgId, m.id, e.target.value as Role))}
                >
                  {ROLES.map((r) => (
                    // Only an owner can hand out ownership; showing the option to an admin
                    // would offer a change the server is going to refuse.
                    <option key={r} value={r} disabled={r === 'owner' && myRole !== 'owner'}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="danger"
                  aria-label={fill(t.portal.memberRemoveNamed, { name: m.name })}
                  onClick={() => apply(apiRemoveMember(orgId, m.id))}
                >
                  {t.portal.memberRemove}
                </button>
              </>
            ) : (
              <RoleBadge role={m.role} />
            )}
          </li>
        ))}
      </ul>
      {error ? <p className="error">{error}</p> : null}
      <p className="muted small">{t.portal.rolesNote}</p>
      {canInvite ? <Invitations orgId={orgId} /> : null}
    </section>
  );
}

/**
 * Outstanding invitations, and the form that makes one.
 *
 * The token is rendered once, from the reply that created it. Nothing re-reads it, because
 * nothing can: the server keeps only its hash.
 */
function Invitations({ orgId }: { orgId: string }) {
  const t = useT();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiInvitations(orgId)
      .then(({ invitations: list }) => setInvitations(list))
      // Signing out cancels nothing already in flight, and this request answers 401 once the
      // session is gone. Unhandled, that rejection reaches the page as an uncaught error.
      // Only that case is swallowed — anything else still surfaces.
      .catch((err) => {
        if (!(err instanceof ApiError) || err.status !== 401) throw err;
      });
  }, [orgId]);

  useEffect(load, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const { token } = await apiInvite(orgId, email.trim(), role);
      // Where the invitee lands. BASE_URL keeps it right under a project subpath.
      setLink(`${window.location.origin}${import.meta.env.BASE_URL}app?invite=${token}`);
      setEmail('');
      load();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? t.portal.inviteTaken
          : t.portal.inviteBadAddress,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="invites">
      <div className="panel-head">
        <h3>{t.portal.invitations}</h3>
        <span className="count">{invitations.filter((i) => !i.acceptedAt).length}</span>
      </div>

      <form className="row" onSubmit={submit}>
        <label className="sr-only" htmlFor="invite-email">
          {t.portal.inviteEmail}
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.portal.inviteEmail}
          required
        />
        <label className="sr-only" htmlFor="invite-role">
          {t.portal.inviteRole}
        </label>
        <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" disabled={busy}>
          {busy ? t.auth.working : t.portal.inviteAction}
        </button>
      </form>
      <p className="muted small">{t.portal.inviteNote}</p>
      {error ? <p className="error">{error}</p> : null}

      {link ? (
        <div className="invite-token">
          <strong>{t.portal.inviteTokenHeading}</strong>
          <code>{link}</code>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? t.portal.inviteCopied : t.portal.inviteCopy}
          </button>
          <p className="muted small">{t.portal.inviteTokenNote}</p>
        </div>
      ) : null}

      {invitations.length === 0 ? (
        <p className="muted small">{t.portal.inviteNone}</p>
      ) : (
        <ul className="list">
          {invitations.map((i) => (
            <li key={i.id}>
              <div className="grow">
                <span className="title">{i.email}</span>
                <span className="meta">
                  {i.acceptedAt
                    ? null
                    : i.expiresAt < Date.now()
                      ? t.portal.inviteExpired
                      : t.portal.invitePending}
                </span>
              </div>
              <RoleBadge role={i.role} />
              {i.acceptedAt ? null : (
                <button
                  type="button"
                  className="ghost"
                  aria-label={fill(t.portal.inviteRevokeNamed, { email: i.email })}
                  onClick={() => {
                    apiRevokeInvitation(orgId, i.id)
                      .then(load)
                      .catch(() => setInvitations((prev) => prev));
                  }}
                >
                  {t.portal.inviteRevoke}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
