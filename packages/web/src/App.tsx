import { APP_NAME, type OrganisationMembership, type Project } from '@hamscaler/shared';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  apiCreateProject,
  apiDeleteProject,
  apiMe,
  apiProjects,
  apiSignIn,
  apiSignOut,
  apiSignUp,
  SIGNED_OUT_EVENT,
} from './lib/api';

/**
 * The whole app: sign in, pick an organisation, work with its projects.
 *
 * One file on purpose. The starter's value is the layers underneath — tenancy, sessions,
 * migrations, the checks — and a reader should be able to see what the UI does without
 * navigating a component tree that exists mostly to demonstrate structure.
 */
export default function App() {
  const [session, setSession] = useState<{ organisations: OrganisationMembership[] } | null>(null);
  const [orgId, setOrgId] = useState<string>('');
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

  if (loading) return <main className="shell">Loading…</main>;
  if (!session) return <SignIn onDone={load} />;

  const org = session.organisations.find((o) => o.id === orgId);

  return (
    <main className="shell">
      <header className="bar">
        <strong>{APP_NAME}</strong>
        <label>
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
        {org ? <span className="role">{org.role}</span> : null}
        <button
          type="button"
          onClick={async () => {
            await apiSignOut();
            setSession(null);
          }}
        >
          Sign out
        </button>
      </header>
      {orgId ? <Projects orgId={orgId} canDelete={org?.role !== 'member'} /> : null}
    </main>
  );
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
          ? 'Password is too short.'
          : mode === 'in'
            ? 'Those details were not accepted.'
            : 'Could not create that account.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h1>{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
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
  );
}

function Projects({ orgId, canDelete }: { orgId: string; canDelete: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');

  const refresh = useCallback(async () => {
    const { projects: list } = await apiProjects(orgId);
    setProjects(list);
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="card">
      <h2>Projects</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await apiCreateProject(orgId, name.trim());
          setName('');
          await refresh();
        }}
      >
        <label>
          <span className="sr-only">New project name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project"
            aria-label="New project name"
          />
        </label>
        <button type="submit">Add</button>
      </form>
      {projects.length === 0 ? (
        <p className="empty">No projects yet.</p>
      ) : (
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              <span>{p.name}</span>
              {canDelete ? (
                <button
                  type="button"
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
