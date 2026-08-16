/**
 * The API.
 *
 * `ROUTE_MANIFEST` at the bottom is not documentation — `authMatrix.test.ts` reads it and
 * asserts every entry behaves correctly for anonymous callers, non-members and members below
 * the required role. A route added without a manifest entry fails that test, so "shipped
 * unprotected" is a build failure rather than something noticed later.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  hasRole,
  INVITE_TTL_SECONDS,
  LIMITS,
  MIN_PASSWORD_LENGTH,
  ROLES,
  type Role,
} from '@hamscaler/shared';
import { Hono } from 'hono';
import {
  createSession,
  destroyAllSessions,
  destroySession,
  destroySessionByHandle,
  hashPassword,
  sessionHandle,
  sessionsFor,
  verifyPassword,
} from './auth.ts';
import { clearSessionCookie, readSessionCookie, setSessionCookie } from './cookies.ts';
import { getMailer } from './mailer.ts';
import {
  type AppContext,
  type AuthVariables,
  param,
  requireOrg,
  requireUser,
} from './middleware.ts';
import {
  addMember,
  createInvitation,
  createOrganisation,
  createProject,
  createUser,
  deleteOrganisation,
  deleteProject,
  deleteUser,
  findInvitationByTokenHash,
  findUserByEmail,
  findUserById,
  getProject,
  listAudit,
  listInvitations,
  listProjects,
  markInvitationAccepted,
  membersOf,
  organisationById,
  organisationsFor,
  ownerCount,
  recordAudit,
  removeMember,
  renameOrganisation,
  revokeInvitation,
  roleIn,
  setMemberRole,
  soleOwnerships,
  updateProject,
  updateUserName,
  updateUserPassword,
} from './repo.ts';
import { clearAttempts, recordAttempt } from './signInAttempts.ts';

/**
 * The actor for an audit entry: who they are, and how to name them later.
 *
 * The label is stored alongside the id because an id stops meaning anything once the account is
 * gone, and the record has to outlive its subject to be worth keeping.
 */
const actorOf = async (c: AppContext) => {
  const id = c.get('userId');
  const user = await findUserById(id);
  return { id, label: user ? `${user.name} <${user.email}>` : id };
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * The invitation a token opens, or null when it is unknown, spent or out of date.
 *
 * One place decides that, so "expired" cannot be handled in the preview and forgotten in the
 * accept — which is the shape this kind of bug takes.
 */
const openInvitation = async (token: string | undefined) => {
  if (!token) return null;
  const invitation = await findInvitationByTokenHash(hashToken(token));
  if (!invitation) return null;
  if (invitation.acceptedAt !== null) return null;
  if (invitation.expiresAt < Date.now()) return null;
  return invitation;
};

/**
 * Where this deployment's front end lives, for links inside emails.
 *
 * Taken from APP_URL when set, and otherwise from the request that is asking — which is right
 * for the common case of one origin serving both halves, and wrong the moment they are split.
 * `globalThis.process?.env` because a Workers runtime has no process global.
 */
const appUrl = (c: AppContext) =>
  (globalThis.process?.env?.APP_URL ?? new URL(c.req.url).origin).replace(/\/$/, '');

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export function createApp(): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();

  app.get('/health', async (c) => {
    return c.json({ ok: true });
  });

  // ── auth ───────────────────────────────────────────────────────────────────────────────

  app.post('/api/auth/sign-up', async (c) => {
    const { email, name, password } = await c.req
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    if (typeof email !== 'string' || !email.includes('@') || typeof name !== 'string' || !name) {
      return c.json({ error: 'invalid-details' }, 400);
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: 'weak-password', minLength: MIN_PASSWORD_LENGTH }, 400);
    }
    if (await findUserByEmail(email)) {
      // Same shape as success would take a step longer, so this is an enumeration oracle
      // either way; saying so plainly is more useful than pretending otherwise.
      return c.json({ error: 'email-taken' }, 409);
    }
    const user = await createUser(email, name, await hashPassword(password));
    // A user with no organisation has nowhere to go, so sign-up creates one and makes them its
    // owner. Every later join is by invitation.
    // Suffixed with randomness, not a timestamp. `Date.now() % 10000` repeats every ten
    // seconds, so two people signing up with the same name inside that window collided on
    // organisations.slug and the second one got a 500 instead of an account.
    const org = await createOrganisation(
      `${name}'s workspace`,
      `${slugify(name)}-${randomUUID().slice(0, 8)}`,
    );
    await addMember(org.id, user.id, 'owner');
    const session = await createSession(user.id);
    setSessionCookie(c, session.id, session.expiresAt);
    return c.json({ user, organisations: await organisationsFor(user.id) }, 201);
  });

  app.post('/api/auth/sign-in', async (c) => {
    const { email, password } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof email !== 'string' || typeof password !== 'string') {
      return c.json({ error: 'invalid-details' }, 400);
    }
    const attempt = await recordAttempt(email);
    if (attempt.lockedOut) {
      return c.json({ error: 'too-many-attempts', retryAfterMs: attempt.retryAfterMs }, 429);
    }
    const user = await findUserByEmail(email);
    // Verified even when the user is unknown, against a throwaway hash, so a wrong address and
    // a wrong password take the same time. Skipping it turns response latency into a list of
    // which addresses have accounts.
    const stored = user?.password ?? (await hashPassword('no-such-user'));
    const ok = await verifyPassword(password, stored);
    if (!user || !ok) {
      return c.json({ error: 'invalid-credentials' }, 401);
    }
    await clearAttempts(email);
    const session = await createSession(user.id);
    setSessionCookie(c, session.id, session.expiresAt);
    return c.json({ user, organisations: await organisationsFor(user.id) });
  });

  app.post('/api/auth/sign-out', requireUser, async (c) => {
    const id = readSessionCookie(c);
    if (id) destroySession(id);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  /** Ends every session for this user, on every device. */
  app.post('/api/auth/sign-out-everywhere', requireUser, async (c) => {
    const count = destroyAllSessions(c.get('userId'));
    clearSessionCookie(c);
    return c.json({ ok: true, sessions: count });
  });

  app.get('/api/me', requireUser, async (c) => {
    const userId = c.get('userId');
    const user = await findUserById(userId);
    if (!user) {
      return c.json({ error: 'not-signed-in' }, 401);
    }
    return c.json({ user, organisations: await organisationsFor(userId) });
  });

  // ── account ────────────────────────────────────────────────────────────────────────────

  app.patch('/api/me', requireUser, async (c) => {
    const { name } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'invalid-details' }, 400);
    }
    const userId = c.get('userId');
    await updateUserName(userId, name.trim());
    return c.json({ user: await findUserById(userId) });
  });

  /**
   * Change a password, and end every other session while doing it.
   *
   * The current password is required even though the caller is already signed in: without it,
   * anyone who finds an unlocked screen can take the account permanently. Ending the other
   * sessions is the point of changing it at all — if the reason is that someone else has it,
   * leaving their session alive achieves nothing.
   */
  app.post('/api/me/password', requireUser, async (c) => {
    const { current, next } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof current !== 'string' || typeof next !== 'string') {
      return c.json({ error: 'invalid-details' }, 400);
    }
    if (next.length < MIN_PASSWORD_LENGTH) {
      return c.json({ error: 'weak-password', minLength: MIN_PASSWORD_LENGTH }, 400);
    }
    const userId = c.get('userId');
    const user = await findUserById(userId);
    const stored = user ? (await findUserByEmail(user.email))?.password : undefined;
    if (!stored || !(await verifyPassword(current, stored))) {
      return c.json({ error: 'invalid-credentials' }, 403);
    }
    await updateUserPassword(userId, await hashPassword(next));
    await destroyAllSessions(userId);
    // Including this one, so a fresh cookie is issued rather than leaving the caller signed out
    // by their own password change.
    const session = await createSession(userId);
    setSessionCookie(c, session.id, session.expiresAt);
    return c.json({ ok: true });
  });

  /**
   * Close the account.
   *
   * Refused while the caller is the only owner of an organisation: memberships cascade from the
   * user, so allowing it would leave a workspace — possibly with other people in it — that
   * nobody can administer. Hand it over or delete it first, and the reply says which ones.
   */
  app.delete('/api/me', requireUser, async (c) => {
    const userId = c.get('userId');
    const stranded = await soleOwnerships(userId);
    if (stranded.length > 0) {
      return c.json({ error: 'sole-owner', organisations: stranded }, 409);
    }
    await destroyAllSessions(userId);
    await deleteUser(userId);
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  /**
   * The devices this account is signed in on.
   *
   * Identified by a handle, never by the session id — that id is the cookie, so returning it
   * would turn the page that lists your sessions into the easiest way to steal one.
   */
  app.get('/api/me/sessions', requireUser, async (c) => {
    const current = readSessionCookie(c);
    const sessions = (await sessionsFor(c.get('userId'))).map((s) => ({
      ...s,
      current: current ? s.handle === sessionHandle(current) : false,
    }));
    return c.json({ sessions });
  });

  app.post('/api/me/sessions/:handle/revoke', requireUser, async (c) => {
    const handle = param(c, 'handle');
    if (!handle || !(await destroySessionByHandle(c.get('userId'), handle))) {
      return c.json({ error: 'not-found' }, 404);
    }
    // Revoking the session making the request is allowed — it is how you sign this device out
    // from a list of devices — so the cookie has to go with it.
    if (readSessionCookie(c) && sessionHandle(readSessionCookie(c) as string) === handle) {
      clearSessionCookie(c);
    }
    return c.json({ sessions: await sessionsFor(c.get('userId')) });
  });

  // ── organisations ──────────────────────────────────────────────────────────────────────

  /**
   * A further organisation, beyond the one sign-up created.
   *
   * Not gated on membership of anything: anyone signed in may start one, and becomes its owner.
   * That is what makes it possible to leave or delete the one you were given without ending up
   * with nowhere to be.
   */
  app.post('/api/orgs', requireUser, async (c) => {
    const { name } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'invalid-details' }, 400);
    }
    const userId = c.get('userId');
    const org = await createOrganisation(
      name.trim(),
      `${slugify(name)}-${randomUUID().slice(0, 8)}`,
    );
    await addMember(org.id, userId, 'owner');
    await recordAudit(org.id, 'organisation.created', await actorOf(c), org.name);
    return c.json({ organisation: org, organisations: await organisationsFor(userId) }, 201);
  });

  app.patch('/api/orgs/:orgId', requireUser, requireOrg('admin'), async (c) => {
    const { name } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'invalid-details' }, 400);
    }
    const orgId = c.get('orgId');
    await renameOrganisation(orgId, name.trim());
    await recordAudit(orgId, 'organisation.renamed', await actorOf(c), name.trim());
    return c.json({ organisations: await organisationsFor(c.get('userId')) });
  });

  /**
   * Deletes the organisation and everything in it.
   *
   * Owner only, and there is no undo. No audit entry is written: the log belongs to the
   * organisation and goes with it, so there is nowhere left to record that this happened.
   */
  app.delete('/api/orgs/:orgId', requireUser, requireOrg('owner'), async (c) => {
    const orgId = c.get('orgId');
    const userId = c.get('userId');
    await deleteOrganisation(orgId);
    return c.json({ organisations: await organisationsFor(userId) });
  });

  // ── organisation members ───────────────────────────────────────────────────────────────

  app.get('/api/orgs/:orgId/members', requireUser, requireOrg('member'), async (c) => {
    return c.json({ members: await membersOf(c.get('orgId')) });
  });

  /**
   * Change what someone may do.
   *
   * Two rules beyond the role gate, both about not handing away more than you hold: you cannot
   * change the role of someone ranked above you, and only an owner can make another owner.
   * Without the first, an admin could demote the owner who appointed them.
   */
  app.patch('/api/orgs/:orgId/members/:userId', requireUser, requireOrg('admin'), async (c) => {
    const orgId = c.get('orgId');
    const actorRole = c.get('role');
    const targetId = param(c, 'userId');
    const { role } = await c.req.json().catch(() => ({}) as Record<string, unknown>);

    if (!targetId || !ROLES.includes(role)) {
      return c.json({ error: 'invalid-details' }, 400);
    }
    const targetRole = await roleIn(orgId, targetId);
    if (!targetRole) {
      return c.json({ error: 'not-found' }, 404);
    }
    if (!hasRole(actorRole, targetRole) || (role === 'owner' && actorRole !== 'owner')) {
      return c.json({ error: 'insufficient-role' }, 403);
    }
    // Demoting the last owner leaves an organisation nobody can administer.
    if (targetRole === 'owner' && role !== 'owner' && (await ownerCount(orgId)) === 1) {
      return c.json({ error: 'last-owner' }, 409);
    }
    await setMemberRole(orgId, targetId, role as Role);
    await recordAudit(
      orgId,
      'member.role-changed',
      await actorOf(c),
      (await findUserById(targetId))?.email ?? targetId,
      `${targetRole} → ${role}`,
    );
    return c.json({ members: await membersOf(orgId) });
  });

  app.delete('/api/orgs/:orgId/members/:userId', requireUser, requireOrg('admin'), async (c) => {
    const orgId = c.get('orgId');
    const actorRole = c.get('role');
    const targetId = param(c, 'userId');
    if (!targetId) {
      return c.json({ error: 'invalid-details' }, 400);
    }
    const targetRole = await roleIn(orgId, targetId);
    if (!targetRole) {
      return c.json({ error: 'not-found' }, 404);
    }
    if (!hasRole(actorRole, targetRole)) {
      return c.json({ error: 'insufficient-role' }, 403);
    }
    if (targetRole === 'owner' && (await ownerCount(orgId)) === 1) {
      return c.json({ error: 'last-owner' }, 409);
    }
    await removeMember(orgId, targetId);
    await recordAudit(
      orgId,
      'member.removed',
      await actorOf(c),
      (await findUserById(targetId))?.email ?? targetId,
    );
    return c.json({ members: await membersOf(orgId) });
  });

  /**
   * Leave an organisation.
   *
   * Its own route rather than a self-delete on the one above, because the two need different
   * permissions: removing somebody else is an admin's job, and leaving is everyone's. Sharing a
   * route would mean the role gate could not sit in the middleware.
   */
  app.post('/api/orgs/:orgId/leave', requireUser, requireOrg('member'), async (c) => {
    const orgId = c.get('orgId');
    const userId = c.get('userId');
    if (c.get('role') === 'owner' && (await ownerCount(orgId)) === 1) {
      // Hand it over first. Leaving would strand every other member.
      return c.json({ error: 'last-owner' }, 409);
    }
    const who = await actorOf(c);
    await removeMember(orgId, userId);
    await recordAudit(orgId, 'member.left', who, who.label);
    return c.json({ organisations: await organisationsFor(userId) });
  });

  /**
   * What has happened in this organisation.
   *
   * Admin-only: it names people and what was done to them, which is more than a member needs
   * and more than they should be handed by default.
   */
  app.get('/api/orgs/:orgId/audit', requireUser, requireOrg('admin'), async (c) => {
    return c.json({ events: await listAudit(c.get('orgId')) });
  });

  // ── invitations ───────────────────────────────────────────────────────────────────────
  //
  // This replaced a POST /members that took an address, looked the user up, and answered 404
  // "no-such-user" when nobody held it. Two faults in one route: it added people to an
  // organisation without asking them, and it answered "is this address registered?" for any
  // address — the question sign-in refuses to answer, since it returns the same 401 whether
  // the address is unknown or the password was wrong.
  //
  // Nothing below ever looks in the users table, so there is no answer to leak.

  app.post('/api/orgs/:orgId/invitations', requireUser, requireOrg('admin'), async (c) => {
    const { email, role } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof email !== 'string' || !email.includes('@') || !['member', 'admin'].includes(role)) {
      return c.json({ error: 'invalid-details' }, 400);
    }
    const orgId = c.get('orgId');
    const token = randomBytes(32).toString('base64url');
    try {
      const invitation = await createInvitation(
        orgId,
        email,
        role as Role,
        c.get('userId'),
        hashToken(token),
        INVITE_TTL_SECONDS,
      );
      await recordAudit(orgId, 'invitation.created', await actorOf(c), email, role as string);

      const mailer = getMailer();
      const org = await organisationById(orgId);
      const link = `${appUrl(c)}/app?invite=${token}`;
      await mailer.send({
        to: email,
        subject: `You have been invited to ${org?.name ?? 'an organisation'}`,
        body: `You have been invited to join ${org?.name ?? 'an organisation'} as a ${role}.\n\n${link}\n\nThe invitation expires in seven days. If you were not expecting it, ignore this message.`,
      });

      // The token comes back only when nothing can deliver it. Returning a live credential in a
      // response body puts it in the browser's memory and in any log between here and there, so
      // it is done when it is the only way to pass the invitation on, and not otherwise.
      return c.json(mailer.delivers ? { invitation } : { invitation, token }, 201);
    } catch {
      // The partial unique index rejects a second outstanding invitation for the same address.
      return c.json({ error: 'already-invited' }, 409);
    }
  });

  app.get('/api/orgs/:orgId/invitations', requireUser, requireOrg('admin'), async (c) => {
    return c.json({ invitations: await listInvitations(c.get('orgId')) });
  });

  app.delete('/api/orgs/:orgId/invitations/:id', requireUser, requireOrg('admin'), async (c) => {
    const id = param(c, 'id');
    const orgId = c.get('orgId');
    const invitation = (await listInvitations(orgId)).find((i) => i.id === id);
    if (!id || !(await revokeInvitation(orgId, id))) {
      return c.json({ error: 'not-found' }, 404);
    }
    await recordAudit(orgId, 'invitation.revoked', await actorOf(c), invitation?.email ?? id);
    return c.body(null, 204);
  });

  /**
   * What an invitation is for, so the client can say "join X as an admin?" before acting.
   *
   * Behind a session deliberately: an anonymous endpoint here would let anyone guessing tokens
   * harvest organisation names. Holding a token is not the same as being allowed to read it.
   */
  app.get('/api/invitations/:token', requireUser, async (c) => {
    const invitation = await openInvitation(param(c, 'token'));
    if (!invitation) {
      return c.json({ error: 'no-such-invitation' }, 404);
    }
    const org = await organisationById(invitation.orgId);
    return c.json({ invitation, organisation: org });
  });

  app.post('/api/invitations/:token/accept', requireUser, async (c) => {
    const invitation = await openInvitation(param(c, 'token'));
    if (!invitation) {
      return c.json({ error: 'no-such-invitation' }, 404);
    }
    const userId = c.get('userId');
    const user = await findUserById(userId);
    // Addressed to a person, not to whoever ends up holding the link. Without this a forwarded
    // invitation is a way into someone else's organisation.
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return c.json({ error: 'wrong-account' }, 403);
    }
    if (await roleIn(invitation.orgId, userId)) {
      await markInvitationAccepted(invitation.orgId, invitation.id);
      return c.json({ organisations: await organisationsFor(userId) }, 200);
    }
    // Single-use: the write only touches a row that has not been accepted, so two requests
    // racing produce one membership and one 404 rather than two memberships.
    if (!(await markInvitationAccepted(invitation.orgId, invitation.id))) {
      return c.json({ error: 'no-such-invitation' }, 404);
    }
    await addMember(invitation.orgId, userId, invitation.role);
    await recordAudit(
      invitation.orgId,
      'invitation.accepted',
      await actorOf(c),
      invitation.email,
      invitation.role,
    );
    return c.json({ organisations: await organisationsFor(userId) }, 201);
  });

  // ── projects (tenant-owned) ────────────────────────────────────────────────────────────

  app.get('/api/orgs/:orgId/projects', requireUser, requireOrg('member'), async (c) => {
    return c.json({ projects: await listProjects(c.get('orgId')) });
  });

  app.post('/api/orgs/:orgId/projects', requireUser, requireOrg('member'), async (c) => {
    const { name, notes } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    if (typeof name !== 'string' || !name.trim()) {
      return c.json({ error: 'invalid-details' }, 400);
    }
    const project = await createProject(
      c.get('orgId'),
      name.trim(),
      typeof notes === 'string' ? notes : '',
    );
    return c.json({ project }, 201);
  });

  app.get('/api/orgs/:orgId/projects/:id', requireUser, requireOrg('member'), async (c) => {
    const project = await getProject(c.get('orgId'), param(c, 'id') as string);
    if (!project) {
      return c.json({ error: 'not-found' }, 404);
    }
    return c.json({ project });
  });

  app.patch('/api/orgs/:orgId/projects/:id', requireUser, requireOrg('member'), async (c) => {
    const { name, notes } = await c.req.json().catch(() => ({}) as Record<string, unknown>);
    const project = await updateProject(c.get('orgId'), param(c, 'id') as string, {
      name: typeof name === 'string' ? name : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    });
    if (!project) {
      return c.json({ error: 'not-found' }, 404);
    }
    return c.json({ project });
  });

  app.delete('/api/orgs/:orgId/projects/:id', requireUser, requireOrg('admin'), async (c) => {
    const gone = await deleteProject(c.get('orgId'), param(c, 'id') as string);
    return gone ? c.json({ ok: true }) : c.json({ error: 'not-found' }, 404);
  });

  return app;
}

// ── route manifest ───────────────────────────────────────────────────────────────────────

export interface RouteSpec {
  method: 'get' | 'post' | 'patch' | 'delete';
  /** `:orgId` and `:id` are substituted by the test. */
  path: string;
  /** null for routes that do not require a session at all. */
  auth: 'anonymous' | 'user' | Role;
}

/**
 * Every route, with what it requires. Read by authMatrix.test.ts, which checks each one
 * against an anonymous caller, a member of another organisation, and — where a role is
 * required — a member who holds too little.
 */
export const ROUTE_MANIFEST: RouteSpec[] = [
  { method: 'get', path: '/health', auth: 'anonymous' },
  { method: 'post', path: '/api/auth/sign-up', auth: 'anonymous' },
  { method: 'post', path: '/api/auth/sign-in', auth: 'anonymous' },
  { method: 'post', path: '/api/auth/sign-out', auth: 'user' },
  { method: 'post', path: '/api/auth/sign-out-everywhere', auth: 'user' },
  { method: 'get', path: '/api/me', auth: 'user' },
  { method: 'patch', path: '/api/me', auth: 'user' },
  { method: 'post', path: '/api/me/password', auth: 'user' },
  { method: 'delete', path: '/api/me', auth: 'user' },
  { method: 'get', path: '/api/me/sessions', auth: 'user' },
  { method: 'post', path: '/api/me/sessions/:handle/revoke', auth: 'user' },
  { method: 'post', path: '/api/orgs', auth: 'user' },
  { method: 'patch', path: '/api/orgs/:orgId', auth: 'admin' },
  { method: 'delete', path: '/api/orgs/:orgId', auth: 'owner' },
  { method: 'get', path: '/api/orgs/:orgId/members', auth: 'member' },
  { method: 'patch', path: '/api/orgs/:orgId/members/:userId', auth: 'admin' },
  { method: 'delete', path: '/api/orgs/:orgId/members/:userId', auth: 'admin' },
  { method: 'post', path: '/api/orgs/:orgId/leave', auth: 'member' },
  { method: 'post', path: '/api/orgs/:orgId/invitations', auth: 'admin' },
  { method: 'get', path: '/api/orgs/:orgId/invitations', auth: 'admin' },
  { method: 'get', path: '/api/orgs/:orgId/audit', auth: 'admin' },
  { method: 'delete', path: '/api/orgs/:orgId/invitations/:id', auth: 'admin' },
  { method: 'get', path: '/api/invitations/:token', auth: 'user' },
  { method: 'post', path: '/api/invitations/:token/accept', auth: 'user' },
  { method: 'get', path: '/api/orgs/:orgId/projects', auth: 'member' },
  { method: 'post', path: '/api/orgs/:orgId/projects', auth: 'member' },
  { method: 'get', path: '/api/orgs/:orgId/projects/:id', auth: 'member' },
  { method: 'patch', path: '/api/orgs/:orgId/projects/:id', auth: 'member' },
  { method: 'delete', path: '/api/orgs/:orgId/projects/:id', auth: 'admin' },
];

export { LIMITS };
