import { APP_NAME, type OrganisationMembership, type Project, type Role } from '@hamscaler/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
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
} from './lib/api';

/**
 * The app: sign in, pick an organisation, work inside it.
 *
 * Kept to one file. The starter's value is underneath — tenancy, sessions, migrations, the
 * checks — and a reader should be able to see the whole UI without navigating a component
 * tree that exists mostly to demonstrate structure.
 */
export default function App() {
  const [session, setSession] = useState<{ organisations: OrganisationMembership[] } | null>(null);
  const [orgId, setOrgId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const me = await apiMe();
      setSession(me);
      setOrgId((current) => current || (me.organisations[0]?.id ?? ''));
    } catch {
      setSession(null);
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
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (!session) return <SignIn onDone={load} />;

  const org = session.organisations.find((o) => o.id === orgId);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              🐹
            </span>
            {APP_NAME}
          </span>
          <label className="org-picker">
            <span className="sr-only">Organisation</span>
            <select
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              aria-label="Organisation"
            >
              {session.organisations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          {org ? <RoleBadge role={org.role} /> : null}
          <button
            type="button"
            className="ghost"
            onClick={async () => {
              await apiSignOut();
              setSession(null);
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="page">
        {org ? (
          <>
            <div className="page-head">
              <h1>{org.name}</h1>
              <p className="muted">
                You are {org.role === 'owner' ? 'the owner' : `an ${org.role}`} of this
                organisation. Everything below belongs to it and to nobody else.
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

function RoleBadge({ role }: { role: Role }) {
  return <span className={`badge badge-${role}`}>{role}</span>;
}

function SignIn({ onDone }: { onDone: () => void }) {
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
          ? 'Password must be at least 10 characters.'
          : err instanceof ApiError && err.code === 'email-taken'
            ? 'That address already has an account.'
            : mode === 'in'
              ? 'Those details were not accepted.'
              : 'Could not create that account.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="centre">
      <form className="panel auth" onSubmit={submit}>
        <span className="mark big" aria-hidden="true">
          🐹
        </span>
        <h1>{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
        <p className="muted">
          {mode === 'in'
            ? 'Your organisation and its data are waiting.'
            : 'You will get an organisation of your own to start in.'}
        </p>
        <label>
          Email
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
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        ) : null}
        <label>
          Password
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
          {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
        <button type="button" className="link" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Create an account instead' : 'I already have an account'}
        </button>
      </form>
    </main>
  );
}

function Projects({ orgId, canDelete }: { orgId: string; canDelete: boolean }) {
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
        <h2>Projects</h2>
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
          <span className="sr-only">New project name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project"
            aria-label="New project name"
          />
        </label>
        <button type="submit" disabled={busy}>
          Add
        </button>
      </form>

      {projects === null ? (
        <p className="muted">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="empty">No projects yet.</p>
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
                  aria-label={`Delete ${p.name}`}
                >
                  Delete
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
        <h2>Members</h2>
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
      <p className="muted small">
        Roles decide what each person may do. Only an admin or owner can remove a project.
      </p>
    </section>
  );
}
