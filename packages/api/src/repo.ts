/**
 * Every read and write of tenant-owned data.
 *
 * The rule this file exists to enforce: **a tenant-owned query takes orgId as its first
 * argument and puts it in the WHERE clause.** Not "should" — the isolation tests assert that
 * asking for another organisation's row returns nothing, and `scripts/check-tenancy.mjs`
 * fails the build if a query in here touches a tenant table without filtering on org_id.
 *
 * Routes never write SQL. That is what keeps the number of places a tenant filter can be
 * forgotten at exactly one file, reviewable in a sitting.
 */

import { randomUUID } from 'node:crypto';
import type {
  AuditEvent,
  Invitation,
  Membership,
  Organisation,
  OrganisationMembership,
  Project,
  Role,
  User,
} from '@hamscaler/shared';
import { all, one, run } from './db/index.ts';

const now = () => Date.now();

// ── users ────────────────────────────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  name: string;
  password: string;
  created_at: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id,
  email: r.email,
  name: r.name,
  createdAt: r.created_at,
});

export async function createUser(email: string, name: string, passwordHash: string): Promise<User> {
  const id = randomUUID();
  await run(
    'INSERT INTO users (id, email, email_key, name, password, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    email,
    email.toLowerCase(),
    name,
    passwordHash,
    now(),
  );
  return { id, email, name, createdAt: now() };
}

export async function findUserByEmail(
  email: string,
): Promise<(User & { password: string }) | null> {
  const row = await one<UserRow>('SELECT * FROM users WHERE email_key = ?', email.toLowerCase());
  return row ? { ...toUser(row), password: row.password } : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const row = await one<UserRow>('SELECT * FROM users WHERE id = ?', id);
  return row ? toUser(row) : null;
}

export async function updateUserName(userId: string, name: string): Promise<boolean> {
  return (await run('UPDATE users SET name = ? WHERE id = ?', name, userId)) > 0;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<boolean> {
  return (await run('UPDATE users SET password = ? WHERE id = ?', passwordHash, userId)) > 0;
}

/**
 * Deletes the account.
 *
 * Memberships and sessions cascade from users(id). Organisations do not — an organisation is
 * not owned by a row in users, and deleting the last owner's account would otherwise take a
 * shared workspace with it. The route refuses while any sole ownership remains.
 */
export async function deleteUser(userId: string): Promise<boolean> {
  return (await run('DELETE FROM users WHERE id = ?', userId)) > 0;
}

/** Organisations where this user is the only owner. Nothing may orphan one. */
export async function soleOwnerships(userId: string): Promise<{ id: string; name: string }[]> {
  return await all<{ id: string; name: string }>(
    `SELECT o.id, o.name
       FROM organisations o
       JOIN memberships mine ON mine.org_id = o.id AND mine.user_id = ? AND mine.role = 'owner'
      WHERE (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id AND m.role = 'owner') = 1`,
    userId,
  );
}

// ── organisations and membership ─────────────────────────────────────────────────────────

export async function createOrganisation(name: string, slug: string): Promise<Organisation> {
  const id = randomUUID();
  const createdAt = now();
  await run(
    'INSERT INTO organisations (id, name, slug, created_at) VALUES (?, ?, ?, ?)',
    id,
    name,
    slug,
    createdAt,
  );
  return { id, name, slug, createdAt };
}

/** One organisation by id. Used to name the organisation an invitation is for. */
export async function organisationById(id: string): Promise<Organisation | null> {
  const row = await one<{ id: string; name: string; slug: string; created_at: number }>(
    'SELECT id, name, slug, created_at FROM organisations WHERE id = ?',
    id,
  );
  return row ? { id: row.id, name: row.name, slug: row.slug, createdAt: row.created_at } : null;
}

export async function renameOrganisation(orgId: string, name: string): Promise<boolean> {
  return (await run('UPDATE organisations SET name = ? WHERE id = ?', name, orgId)) > 0;
}

/**
 * Deletes an organisation and everything belonging to it.
 *
 * The cascade is in the schema, not here: memberships, projects, invitations and audit_events
 * all reference organisations(id) ON DELETE CASCADE. Doing it in application code instead means
 * a table added later is quietly left orphaned, and nothing fails.
 */
export async function deleteOrganisation(orgId: string): Promise<boolean> {
  return (await run('DELETE FROM organisations WHERE id = ?', orgId)) > 0;
}

export async function addMember(orgId: string, userId: string, role: Role): Promise<Membership> {
  const createdAt = now();
  await run(
    'INSERT INTO memberships (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)',
    orgId,
    userId,
    role,
    createdAt,
  );
  return { orgId, userId, role, createdAt };
}

/**
 * The organisations a user belongs to, with their role in each.
 *
 * This is the only place a user's reachable tenants are decided; every other query takes an
 * orgId that came from here, checked against this user.
 */
export async function organisationsFor(userId: string): Promise<OrganisationMembership[]> {
  return (
    await all<{ id: string; name: string; slug: string; created_at: number; role: Role }>(
      `SELECT o.id, o.name, o.slug, o.created_at, m.role
       FROM organisations o
       JOIN memberships m ON m.org_id = o.id
      WHERE m.user_id = ?
      ORDER BY o.created_at`,
      userId,
    )
  ).map((r) => ({ id: r.id, name: r.name, slug: r.slug, createdAt: r.created_at, role: r.role }));
}

/** The role a user holds in an organisation, or null if they are not a member of it. */
export async function roleIn(orgId: string, userId: string): Promise<Role | null> {
  const row = await one<{ role: Role }>(
    'SELECT role FROM memberships WHERE org_id = ? AND user_id = ?',
    orgId,
    userId,
  );
  return row?.role ?? null;
}

export async function membersOf(orgId: string): Promise<(User & { role: Role })[]> {
  return (
    await all<UserRow & { role: Role }>(
      `SELECT u.*, m.role
       FROM users u
       JOIN memberships m ON m.user_id = u.id
      WHERE m.org_id = ?
      ORDER BY m.created_at`,
      orgId,
    )
  ).map((r) => ({ ...toUser(r), role: r.role }));
}

/**
 * How many owners an organisation has.
 *
 * Every removal and demotion is checked against this. An organisation with no owner is one
 * nobody can administer any more — not a state to arrive at by removing one person too many.
 */
export async function ownerCount(orgId: string): Promise<number> {
  const row = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM memberships WHERE org_id = ? AND role = 'owner'",
    orgId,
  );
  return row?.n ?? 0;
}

export async function setMemberRole(orgId: string, userId: string, role: Role): Promise<boolean> {
  return (
    (await run(
      'UPDATE memberships SET role = ? WHERE org_id = ? AND user_id = ?',
      role,
      orgId,
      userId,
    )) > 0
  );
}

export async function removeMember(orgId: string, userId: string): Promise<boolean> {
  return (await run('DELETE FROM memberships WHERE org_id = ? AND user_id = ?', orgId, userId)) > 0;
}

// ── invitations (tenant-owned) ───────────────────────────────────────────────────────────

interface InvitationRow {
  id: string;
  org_id: string;
  email: string;
  role: Role;
  created_at: number;
  expires_at: number;
  accepted_at: number | null;
}

const toInvitation = (r: InvitationRow): Invitation => ({
  id: r.id,
  orgId: r.org_id,
  email: r.email,
  role: r.role,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  acceptedAt: r.accepted_at,
});

/**
 * Records an invitation and returns it with the token, which is the only time the token
 * exists outside the caller's hands — only its hash is stored.
 *
 * Throws on the unique index when the organisation already has an outstanding invitation for
 * the address; the route turns that into a 409 rather than quietly issuing a second token.
 */
export async function createInvitation(
  orgId: string,
  email: string,
  role: Role,
  invitedBy: string,
  tokenHash: string,
  ttlSeconds: number,
): Promise<Invitation> {
  const id = randomUUID();
  const createdAt = now();
  const expiresAt = createdAt + ttlSeconds * 1000;
  await run(
    `INSERT INTO invitations
       (id, org_id, email, email_key, role, token_hash, invited_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    orgId,
    email,
    email.toLowerCase(),
    role,
    tokenHash,
    invitedBy,
    createdAt,
    expiresAt,
  );
  return { id, orgId, email, role, createdAt, expiresAt, acceptedAt: null };
}

export async function listInvitations(orgId: string): Promise<Invitation[]> {
  return (
    await all<InvitationRow>(
      'SELECT * FROM invitations WHERE org_id = ? ORDER BY created_at DESC',
      orgId,
    )
  ).map(toInvitation);
}

export async function revokeInvitation(orgId: string, id: string): Promise<boolean> {
  return (
    (await run(
      'DELETE FROM invitations WHERE org_id = ? AND id = ? AND accepted_at IS NULL',
      orgId,
      id,
    )) > 0
  );
}

/**
 * The invitation a token refers to, or null.
 *
 * tenancy-exempt: the token is what identifies the organisation. Whoever is accepting is by
 * definition not yet a member, so there is no orgId to check them against — requiring one
 * here would mean the client naming the organisation it wants to join, which is a worse API
 * and no safer. The row's own org_id is what every call after this one is scoped to.
 */
export async function findInvitationByTokenHash(tokenHash: string): Promise<Invitation | null> {
  const row = await one<InvitationRow>('SELECT * FROM invitations WHERE token_hash = ?', tokenHash);
  return row ? toInvitation(row) : null;
}

/** Marks an invitation used. Returns false if it was already accepted, which makes it single-use. */
export async function markInvitationAccepted(orgId: string, id: string): Promise<boolean> {
  return (
    (await run(
      'UPDATE invitations SET accepted_at = ? WHERE org_id = ? AND id = ? AND accepted_at IS NULL',
      now(),
      orgId,
      id,
    )) > 0
  );
}

// ── audit log (tenant-owned) ─────────────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  org_id: string;
  action: string;
  actor_id: string | null;
  actor_label: string;
  subject: string;
  detail: string;
  created_at: number;
}

/** Appends an event. Never updated and never deleted — that is what makes it a record. */
export async function recordAudit(
  orgId: string,
  action: string,
  actor: { id: string; label: string },
  subject = '',
  detail = '',
): Promise<void> {
  await run(
    `INSERT INTO audit_events
       (id, org_id, action, actor_id, actor_label, subject, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    orgId,
    action,
    actor.id,
    actor.label,
    subject,
    detail,
    now(),
  );
}

export async function listAudit(orgId: string, limit = 50): Promise<AuditEvent[]> {
  return (
    await all<AuditRow>(
      'SELECT * FROM audit_events WHERE org_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
      orgId,
      limit,
    )
  ).map((r) => ({
    id: r.id,
    orgId: r.org_id,
    action: r.action,
    actorId: r.actor_id,
    actorLabel: r.actor_label,
    subject: r.subject,
    detail: r.detail,
    createdAt: r.created_at,
  }));
}

// ── projects (tenant-owned) ──────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  org_id: string;
  name: string;
  notes: string;
  created_at: number;
  updated_at: number;
}

const toProject = (r: ProjectRow): Project => ({
  id: r.id,
  orgId: r.org_id,
  name: r.name,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listProjects(orgId: string): Promise<Project[]> {
  return (
    await all<ProjectRow>('SELECT * FROM projects WHERE org_id = ? ORDER BY created_at DESC', orgId)
  ).map(toProject);
}

/**
 * One project *within an organisation*.
 *
 * The org_id in the WHERE clause is the whole point: looking a project up by id alone would
 * return it to anyone who guessed the id, which is the single most common multi-tenant leak.
 */
export async function getProject(orgId: string, id: string): Promise<Project | null> {
  const row = await one<ProjectRow>(
    'SELECT * FROM projects WHERE org_id = ? AND id = ?',
    orgId,
    id,
  );
  return row ? toProject(row) : null;
}

export async function createProject(orgId: string, name: string, notes = ''): Promise<Project> {
  const id = randomUUID();
  const at = now();
  await run(
    'INSERT INTO projects (id, org_id, name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    orgId,
    name,
    notes,
    at,
    at,
  );
  return { id, orgId, name, notes, createdAt: at, updatedAt: at };
}

export async function updateProject(
  orgId: string,
  id: string,
  patch: { name?: string; notes?: string },
): Promise<Project | null> {
  const existing = await getProject(orgId, id);
  if (!existing) return null;
  const name = patch.name ?? existing.name;
  const notes = patch.notes ?? existing.notes;
  await run(
    'UPDATE projects SET name = ?, notes = ?, updated_at = ? WHERE org_id = ? AND id = ?',
    name,
    notes,
    now(),
    orgId,
    id,
  );
  return getProject(orgId, id);
}

export async function deleteProject(orgId: string, id: string): Promise<boolean> {
  return (await run('DELETE FROM projects WHERE org_id = ? AND id = ?', orgId, id)) > 0;
}
