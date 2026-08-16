/**
 * Every call to the API.
 *
 * `credentials: 'same-origin'` on all of them: the session is an httpOnly cookie, which
 * JavaScript deliberately cannot read. That is the point — an XSS bug cannot exfiltrate a
 * session it has no way to see, which is not true of a token in localStorage.
 */

import type {
  AuditEvent,
  Invitation,
  Organisation,
  OrganisationMembership,
  Project,
  Role,
  Session,
  User,
} from '@hamscaler/shared';

const BASE = import.meta.env.VITE_API_URL ?? '';

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
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    // One event, not a throw at every call site: the app listens in one place and swaps in the
    // sign-in form rather than each screen inventing its own handling.
    //
    // Not for /api/auth, though. A 401 there means "those credentials are wrong", not "your
    // session ended" — announcing the end of a session that never started tears down the form
    // the message was about to appear in. The code from the body is kept for the same reason:
    // flattening every 401 to 'not-signed-in' threw away the server's actual answer.
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    }
    throw new ApiError(res.status, body.error ?? `http-${res.status}`);
  }
  // 204 carries no body, and asking for one throws. Revoking an invitation answers this way.
  if (res.status === 204) return undefined as T;
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

export const apiSetMemberRole = (orgId: string, userId: string, role: Role) =>
  call<{ members: (User & { role: Role })[] }>(`/api/orgs/${orgId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });

export const apiRemoveMember = (orgId: string, userId: string) =>
  call<{ members: (User & { role: Role })[] }>(`/api/orgs/${orgId}/members/${userId}`, {
    method: 'DELETE',
  });

export const apiLeaveOrg = (orgId: string) =>
  call<{ organisations: OrganisationMembership[] }>(`/api/orgs/${orgId}/leave`, { method: 'POST' });

export const apiAudit = (orgId: string) =>
  call<{ events: AuditEvent[] }>(`/api/orgs/${orgId}/audit`);

export const apiInvitations = (orgId: string) =>
  call<{ invitations: Invitation[] }>(`/api/orgs/${orgId}/invitations`);

/**
 * The token comes back exactly once, here. It is not stored, so there is no second chance to
 * read it — the caller has to hand it over now.
 */
export const apiInvite = (orgId: string, email: string, role: Role) =>
  call<{ invitation: Invitation; token: string }>(`/api/orgs/${orgId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });

export const apiRevokeInvitation = (orgId: string, id: string) =>
  call<void>(`/api/orgs/${orgId}/invitations/${id}`, { method: 'DELETE' });

export const apiOpenInvitation = (token: string) =>
  call<{ invitation: Invitation; organisation: Organisation }>(`/api/invitations/${token}`);

export const apiAcceptInvitation = (token: string) =>
  call<{ organisations: OrganisationMembership[] }>(`/api/invitations/${token}/accept`, {
    method: 'POST',
  });

export type { AuditEvent, Invitation, Organisation, OrganisationMembership, Project, Session };
