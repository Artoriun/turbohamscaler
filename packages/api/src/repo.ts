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

export function createUser(email: string, name: string, passwordHash: string): User {
  const id = randomUUID();
  run(
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

export function findUserByEmail(email: string): (User & { password: string }) | null {
  const row = one<UserRow>('SELECT * FROM users WHERE email_key = ?', email.toLowerCase());
  return row ? { ...toUser(row), password: row.password } : null;
}

export function findUserById(id: string): User | null {
  const row = one<UserRow>('SELECT * FROM users WHERE id = ?', id);
  return row ? toUser(row) : null;
}

// ── organisations and membership ─────────────────────────────────────────────────────────

export function createOrganisation(name: string, slug: string): Organisation {
  const id = randomUUID();
  const createdAt = now();
  run(
    'INSERT INTO organisations (id, name, slug, created_at) VALUES (?, ?, ?, ?)',
    id,
    name,
    slug,
    createdAt,
  );
  return { id, name, slug, createdAt };
}

export function addMember(orgId: string, userId: string, role: Role): Membership {
  const createdAt = now();
  run(
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
export function organisationsFor(userId: string): OrganisationMembership[] {
  return all<{ id: string; name: string; slug: string; created_at: number; role: Role }>(
    `SELECT o.id, o.name, o.slug, o.created_at, m.role
       FROM organisations o
       JOIN memberships m ON m.org_id = o.id
      WHERE m.user_id = ?
      ORDER BY o.created_at`,
    userId,
  ).map((r) => ({ id: r.id, name: r.name, slug: r.slug, createdAt: r.created_at, role: r.role }));
}

/** The role a user holds in an organisation, or null if they are not a member of it. */
export function roleIn(orgId: string, userId: string): Role | null {
  const row = one<{ role: Role }>(
    'SELECT role FROM memberships WHERE org_id = ? AND user_id = ?',
    orgId,
    userId,
  );
  return row?.role ?? null;
}

export function membersOf(orgId: string): (User & { role: Role })[] {
  return all<UserRow & { role: Role }>(
    `SELECT u.*, m.role
       FROM users u
       JOIN memberships m ON m.user_id = u.id
      WHERE m.org_id = ?
      ORDER BY m.created_at`,
    orgId,
  ).map((r) => ({ ...toUser(r), role: r.role }));
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

export function listProjects(orgId: string): Project[] {
  return all<ProjectRow>(
    'SELECT * FROM projects WHERE org_id = ? ORDER BY created_at DESC',
    orgId,
  ).map(toProject);
}

/**
 * One project *within an organisation*.
 *
 * The org_id in the WHERE clause is the whole point: looking a project up by id alone would
 * return it to anyone who guessed the id, which is the single most common multi-tenant leak.
 */
export function getProject(orgId: string, id: string): Project | null {
  const row = one<ProjectRow>('SELECT * FROM projects WHERE org_id = ? AND id = ?', orgId, id);
  return row ? toProject(row) : null;
}

export function createProject(orgId: string, name: string, notes = ''): Project {
  const id = randomUUID();
  const at = now();
  run(
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

export function updateProject(
  orgId: string,
  id: string,
  patch: { name?: string; notes?: string },
): Project | null {
  const existing = getProject(orgId, id);
  if (!existing) return null;
  const name = patch.name ?? existing.name;
  const notes = patch.notes ?? existing.notes;
  run(
    'UPDATE projects SET name = ?, notes = ?, updated_at = ? WHERE org_id = ? AND id = ?',
    name,
    notes,
    now(),
    orgId,
    id,
  );
  return getProject(orgId, id);
}

export function deleteProject(orgId: string, id: string): boolean {
  return run('DELETE FROM projects WHERE org_id = ? AND id = ?', orgId, id) > 0;
}
