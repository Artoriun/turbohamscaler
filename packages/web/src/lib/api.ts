/**
 * Every call to the API.
 *
 * `credentials: 'same-origin'` on all of them: the session is an httpOnly cookie, which
 * JavaScript deliberately cannot read. That is the point — an XSS bug cannot exfiltrate a
 * session it has no way to see, which is not true of a token in localStorage.
 */

import type {
  Organisation,
  OrganisationMembership,
  Project,
  Role,
  Session,
  User,
} from '@hamscaler/shared';

const BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Whether there is an API to talk to at all.
 *
 * The public pages are static and deploy anywhere; the app behind them needs a server. On a
 * static host with no VITE_API_URL every call would resolve against the static origin and
 * 404, so the portal says so plainly instead of offering a sign-in form that cannot work.
 *
 * Dev is exempt: there VITE_API_URL is normally unset because Vite proxies /api locally.
 */
export const HAS_API = import.meta.env.DEV || BASE !== '';

/** Fired when the API says the session is gone, so the app can show the sign-in form once. */
export const SIGNED_OUT_EVENT = 'hamscaler-signed-out';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (res.status === 401) {
    // One event, not a throw at every call site: the app listens in one place and swaps in the
    // sign-in form rather than each screen inventing its own handling.
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    throw new ApiError(401, 'not-signed-in');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `http-${res.status}`);
  }
  return (await res.json()) as T;
}

export const apiSignUp = (email: string, name: string, password: string) =>
  call<Session>('/api/auth/sign-up', {
    method: 'POST',
    body: JSON.stringify({ email, name, password }),
  });

export const apiSignIn = (email: string, password: string) =>
  call<Session>('/api/auth/sign-in', { method: 'POST', body: JSON.stringify({ email, password }) });

export const apiSignOut = () => call<{ ok: true }>('/api/auth/sign-out', { method: 'POST' });

export const apiMe = () => call<Session>('/api/me');

export const apiProjects = (orgId: string) =>
  call<{ projects: Project[] }>(`/api/orgs/${orgId}/projects`);

export const apiCreateProject = (orgId: string, name: string) =>
  call<{ project: Project }>(`/api/orgs/${orgId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const apiDeleteProject = (orgId: string, id: string) =>
  call<{ ok: true }>(`/api/orgs/${orgId}/projects/${id}`, { method: 'DELETE' });

export const apiMembers = (orgId: string) =>
  call<{ members: (User & { role: Role })[] }>(`/api/orgs/${orgId}/members`);

export type { Organisation, OrganisationMembership, Project, Session };
