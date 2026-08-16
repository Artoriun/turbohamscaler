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
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import {
  createSession,
  destroyAllSessions,
  destroySession,
  hashPassword,
  SESSION_COOKIE,
  verifyPassword,
} from './auth.ts';
import { clearSessionCookie, setSessionCookie } from './cookies.ts';
import { type AuthedRequest, param, requireOrg, requireUser } from './middleware.ts';
import {
  addMember,
  createInvitation,
  createOrganisation,
  createProject,
  createUser,
  deleteProject,
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
  revokeInvitation,
  roleIn,
  setMemberRole,
  updateProject,
} from './repo.ts';
import { clearAttempts, recordAttempt } from './signInAttempts.ts';

/**
 * The actor for an audit entry: who they are, and how to name them later.
 *
 * The label is stored alongside the id because an id stops meaning anything once the account is
 * gone, and the record has to outlive its subject to be worth keeping.
 */
const actorOf = async (req: express.Request) => {
  const id = (req as AuthedRequest).userId as string;
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

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/health', async (_req, res) => {
    res.json({ ok: true });
  });

  // ── auth ───────────────────────────────────────────────────────────────────────────────

  app.post('/api/auth/sign-up', async (req, res) => {
    const { email, name, password } = req.body ?? {};
    if (typeof email !== 'string' || !email.includes('@') || typeof name !== 'string' || !name) {
      res.status(400).json({ error: 'invalid-details' });
      return;
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: 'weak-password', minLength: MIN_PASSWORD_LENGTH });
      return;
    }
    if (await findUserByEmail(email)) {
      // Same shape as success would take a step longer, so this is an enumeration oracle
      // either way; saying so plainly is more useful than pretending otherwise.
      res.status(409).json({ error: 'email-taken' });
      return;
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
    setSessionCookie(res, session.id, session.expiresAt);
    res.status(201).json({ user, organisations: await organisationsFor(user.id) });
  });

  app.post('/api/auth/sign-in', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'invalid-details' });
      return;
    }
    const attempt = await recordAttempt(email);
    if (attempt.lockedOut) {
      res.status(429).json({ error: 'too-many-attempts', retryAfterMs: attempt.retryAfterMs });
      return;
    }
    const user = await findUserByEmail(email);
    // Verified even when the user is unknown, against a throwaway hash, so a wrong address and
    // a wrong password take the same time. Skipping it turns response latency into a list of
    // which addresses have accounts.
    const stored = user?.password ?? (await hashPassword('no-such-user'));
    const ok = await verifyPassword(password, stored);
    if (!user || !ok) {
      res.status(401).json({ error: 'invalid-credentials' });
      return;
    }
    await clearAttempts(email);
    const session = await createSession(user.id);
    setSessionCookie(res, session.id, session.expiresAt);
    res.json({ user, organisations: await organisationsFor(user.id) });
  });

  app.post('/api/auth/sign-out', requireUser, async (req, res) => {
    const id = req.cookies?.[SESSION_COOKIE];
    if (id) destroySession(id);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  /** Ends every session for this user, on every device. */
  app.post('/api/auth/sign-out-everywhere', requireUser, async (req, res) => {
    const count = destroyAllSessions((req as AuthedRequest).userId as string);
    clearSessionCookie(res);
    res.json({ ok: true, sessions: count });
  });

  app.get('/api/me', requireUser, async (req, res) => {
    const userId = (req as AuthedRequest).userId as string;
    const user = await findUserById(userId);
    if (!user) {
      res.status(401).json({ error: 'not-signed-in' });
      return;
    }
    res.json({ user, organisations: await organisationsFor(userId) });
  });

  // ── organisation members ───────────────────────────────────────────────────────────────

  app.get('/api/orgs/:orgId/members', requireUser, requireOrg('member'), async (req, res) => {
    res.json({ members: await membersOf((req as AuthedRequest).orgId as string) });
  });

  /**
   * Change what someone may do.
   *
   * Two rules beyond the role gate, both about not handing away more than you hold: you cannot
   * change the role of someone ranked above you, and only an owner can make another owner.
   * Without the first, an admin could demote the owner who appointed them.
   */
  app.patch(
    '/api/orgs/:orgId/members/:userId',
    requireUser,
    requireOrg('admin'),
    async (req, res) => {
      const orgId = (req as AuthedRequest).orgId as string;
      const actorRole = (req as AuthedRequest).role as Role;
      const targetId = param(req, 'userId');
      const { role } = req.body ?? {};

      if (!targetId || !ROLES.includes(role)) {
        res.status(400).json({ error: 'invalid-details' });
        return;
      }
      const targetRole = await roleIn(orgId, targetId);
      if (!targetRole) {
        res.status(404).json({ error: 'not-found' });
        return;
      }
      if (!hasRole(actorRole, targetRole) || (role === 'owner' && actorRole !== 'owner')) {
        res.status(403).json({ error: 'insufficient-role' });
        return;
      }
      // Demoting the last owner leaves an organisation nobody can administer.
      if (targetRole === 'owner' && role !== 'owner' && (await ownerCount(orgId)) === 1) {
        res.status(409).json({ error: 'last-owner' });
        return;
      }
      await setMemberRole(orgId, targetId, role as Role);
      await recordAudit(
        orgId,
        'member.role-changed',
        await actorOf(req),
        (await findUserById(targetId))?.email ?? targetId,
        `${targetRole} → ${role}`,
      );
      res.json({ members: await membersOf(orgId) });
    },
  );

  app.delete(
    '/api/orgs/:orgId/members/:userId',
    requireUser,
    requireOrg('admin'),
    async (req, res) => {
      const orgId = (req as AuthedRequest).orgId as string;
      const actorRole = (req as AuthedRequest).role as Role;
      const targetId = param(req, 'userId');
      if (!targetId) {
        res.status(400).json({ error: 'invalid-details' });
        return;
      }
      const targetRole = await roleIn(orgId, targetId);
      if (!targetRole) {
        res.status(404).json({ error: 'not-found' });
        return;
      }
      if (!hasRole(actorRole, targetRole)) {
        res.status(403).json({ error: 'insufficient-role' });
        return;
      }
      if (targetRole === 'owner' && (await ownerCount(orgId)) === 1) {
        res.status(409).json({ error: 'last-owner' });
        return;
      }
      await removeMember(orgId, targetId);
      await recordAudit(
        orgId,
        'member.removed',
        await actorOf(req),
        (await findUserById(targetId))?.email ?? targetId,
      );
      res.json({ members: await membersOf(orgId) });
    },
  );

  /**
   * Leave an organisation.
   *
   * Its own route rather than a self-delete on the one above, because the two need different
   * permissions: removing somebody else is an admin's job, and leaving is everyone's. Sharing a
   * route would mean the role gate could not sit in the middleware.
   */
  app.post('/api/orgs/:orgId/leave', requireUser, requireOrg('member'), async (req, res) => {
    const orgId = (req as AuthedRequest).orgId as string;
    const userId = (req as AuthedRequest).userId as string;
    if ((req as AuthedRequest).role === 'owner' && (await ownerCount(orgId)) === 1) {
      // Hand it over first. Leaving would strand every other member.
      res.status(409).json({ error: 'last-owner' });
      return;
    }
    const who = await actorOf(req);
    await removeMember(orgId, userId);
    await recordAudit(orgId, 'member.left', who, who.label);
    res.json({ organisations: await organisationsFor(userId) });
  });

  /**
   * What has happened in this organisation.
   *
   * Admin-only: it names people and what was done to them, which is more than a member needs
   * and more than they should be handed by default.
   */
  app.get('/api/orgs/:orgId/audit', requireUser, requireOrg('admin'), async (req, res) => {
    res.json({ events: await listAudit((req as AuthedRequest).orgId as string) });
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

  app.post('/api/orgs/:orgId/invitations', requireUser, requireOrg('admin'), async (req, res) => {
    const { email, role } = req.body ?? {};
    if (typeof email !== 'string' || !email.includes('@') || !['member', 'admin'].includes(role)) {
      res.status(400).json({ error: 'invalid-details' });
      return;
    }
    const orgId = (req as AuthedRequest).orgId as string;
    const token = randomBytes(32).toString('base64url');
    try {
      const invitation = await createInvitation(
        orgId,
        email,
        role as Role,
        (req as AuthedRequest).userId as string,
        hashToken(token),
        INVITE_TTL_SECONDS,
      );
      // The only time the token leaves the server. There is no mail sender in this starter, so
      // the caller is responsible for delivering it; wire one in here and stop returning it.
      await recordAudit(orgId, 'invitation.created', await actorOf(req), email, role as string);
      res.status(201).json({ invitation, token });
    } catch {
      // The partial unique index rejects a second outstanding invitation for the same address.
      res.status(409).json({ error: 'already-invited' });
    }
  });

  app.get('/api/orgs/:orgId/invitations', requireUser, requireOrg('admin'), async (req, res) => {
    res.json({ invitations: await listInvitations((req as AuthedRequest).orgId as string) });
  });

  app.delete(
    '/api/orgs/:orgId/invitations/:id',
    requireUser,
    requireOrg('admin'),
    async (req, res) => {
      const id = param(req, 'id');
      const orgId = (req as AuthedRequest).orgId as string;
      const invitation = (await listInvitations(orgId)).find((i) => i.id === id);
      if (!id || !(await revokeInvitation(orgId, id))) {
        res.status(404).json({ error: 'not-found' });
        return;
      }
      await recordAudit(orgId, 'invitation.revoked', await actorOf(req), invitation?.email ?? id);
      res.status(204).end();
    },
  );

  /**
   * What an invitation is for, so the client can say "join X as an admin?" before acting.
   *
   * Behind a session deliberately: an anonymous endpoint here would let anyone guessing tokens
   * harvest organisation names. Holding a token is not the same as being allowed to read it.
   */
  app.get('/api/invitations/:token', requireUser, async (req, res) => {
    const invitation = await openInvitation(param(req, 'token'));
    if (!invitation) {
      res.status(404).json({ error: 'no-such-invitation' });
      return;
    }
    const org = await organisationById(invitation.orgId);
    res.json({ invitation, organisation: org });
  });

  app.post('/api/invitations/:token/accept', requireUser, async (req, res) => {
    const invitation = await openInvitation(param(req, 'token'));
    if (!invitation) {
      res.status(404).json({ error: 'no-such-invitation' });
      return;
    }
    const userId = (req as AuthedRequest).userId as string;
    const user = await findUserById(userId);
    // Addressed to a person, not to whoever ends up holding the link. Without this a forwarded
    // invitation is a way into someone else's organisation.
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      res.status(403).json({ error: 'wrong-account' });
      return;
    }
    if (await roleIn(invitation.orgId, userId)) {
      await markInvitationAccepted(invitation.orgId, invitation.id);
      res.status(200).json({ organisations: await organisationsFor(userId) });
      return;
    }
    // Single-use: the write only touches a row that has not been accepted, so two requests
    // racing produce one membership and one 404 rather than two memberships.
    if (!(await markInvitationAccepted(invitation.orgId, invitation.id))) {
      res.status(404).json({ error: 'no-such-invitation' });
      return;
    }
    await addMember(invitation.orgId, userId, invitation.role);
    await recordAudit(
      invitation.orgId,
      'invitation.accepted',
      await actorOf(req),
      invitation.email,
      invitation.role,
    );
    res.status(201).json({ organisations: await organisationsFor(userId) });
  });

  // ── projects (tenant-owned) ────────────────────────────────────────────────────────────

  app.get('/api/orgs/:orgId/projects', requireUser, requireOrg('member'), async (req, res) => {
    res.json({ projects: await listProjects((req as AuthedRequest).orgId as string) });
  });

  app.post('/api/orgs/:orgId/projects', requireUser, requireOrg('member'), async (req, res) => {
    const { name, notes } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'invalid-details' });
      return;
    }
    const project = await createProject(
      (req as AuthedRequest).orgId as string,
      name.trim(),
      typeof notes === 'string' ? notes : '',
    );
    res.status(201).json({ project });
  });

  app.get('/api/orgs/:orgId/projects/:id', requireUser, requireOrg('member'), async (req, res) => {
    const project = await getProject(
      (req as AuthedRequest).orgId as string,
      param(req, 'id') as string,
    );
    if (!project) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    res.json({ project });
  });

  app.patch(
    '/api/orgs/:orgId/projects/:id',
    requireUser,
    requireOrg('member'),
    async (req, res) => {
      const { name, notes } = req.body ?? {};
      const project = await updateProject(
        (req as AuthedRequest).orgId as string,
        param(req, 'id') as string,
        {
          name: typeof name === 'string' ? name : undefined,
          notes: typeof notes === 'string' ? notes : undefined,
        },
      );
      if (!project) {
        res.status(404).json({ error: 'not-found' });
        return;
      }
      res.json({ project });
    },
  );

  app.delete(
    '/api/orgs/:orgId/projects/:id',
    requireUser,
    requireOrg('admin'),
    async (req, res) => {
      const gone = await deleteProject(
        (req as AuthedRequest).orgId as string,
        param(req, 'id') as string,
      );
      res.status(gone ? 200 : 404).json(gone ? { ok: true } : { error: 'not-found' });
    },
  );

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
