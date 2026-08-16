/**
 * Types and constants shared by the API and the web app.
 *
 * Ships raw TypeScript (`main` points at this file) and is loaded three ways: by `tsc` when it
 * compiles the API, by Node's type stripping under the test runner, and by Vite. Those have
 * incompatible rules about relative import specifiers, so this package deliberately stays a
 * single module with no relative imports of its own.
 */

export const APP_NAME = 'TurboHamscaler';

// ── languages ────────────────────────────────────────────────────────────────────────────

/**
 * Supported languages, most-default first.
 *
 * Lives here rather than in the web package so anything that needs the list — a prerenderer,
 * a sitemap generator — reads the same one. The dictionaries in packages/web/src/i18n are
 * checked against it, so adding a code here without a dictionary is a type error rather than
 * a page of blanks.
 */
export const LANGS = ['en', 'ja'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = LANGS[0];

// ── roles ────────────────────────────────────────────────────────────────────────────────

/**
 * Membership roles, ordered least to most privileged. The order is the authorisation model:
 * `rank()` compares positions, so adding a role is one edit here rather than a new branch in
 * every route.
 */
export const ROLES = ['member', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/** Position in ROLES; -1 for anything unrecognised, which therefore satisfies no requirement. */
export function rank(role: string): number {
  return (ROLES as readonly string[]).indexOf(role);
}

/** Whether `role` meets or exceeds `required`. */
export function hasRole(role: string, required: Role): boolean {
  const held = rank(role);
  return held >= 0 && held >= rank(required);
}

// ── entities ─────────────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
}

export interface Membership {
  orgId: string;
  userId: string;
  role: Role;
  createdAt: number;
}

/** An organisation as it appears to a signed-in user, with the role they hold in it. */
export interface OrganisationMembership extends Organisation {
  role: Role;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * A standing offer to join an organisation.
 *
 * There is no token on this type on purpose. The token is returned exactly once, by the call
 * that creates the invitation, and only its hash is stored — so listing invitations later can
 * never hand one out, and a copy of the database is not a set of live keys.
 */
export interface Invitation {
  id: string;
  orgId: string;
  /** The address it was addressed to, as typed. Never checked against the user table. */
  email: string;
  role: Role;
  createdAt: number;
  expiresAt: number;
  acceptedAt: number | null;
}

/**
 * One thing that happened in an organisation.
 *
 * The actor is described as well as identified: an id alone stops meaning anything the moment
 * that account is deleted, and a record that outlives its subject is the whole point.
 */
export interface AuditEvent {
  id: string;
  orgId: string;
  action: string;
  actorId: string | null;
  /** The actor's name and address as they were when this happened. */
  actorLabel: string;
  subject: string;
  detail: string;
  createdAt: number;
}

/** What `/api/me` answers: who you are and which organisations you can act in. */
export interface Session {
  user: User;
  organisations: OrganisationMembership[];
}

// ── limits ───────────────────────────────────────────────────────────────────────────────

/** How long a session cookie stays valid without being renewed. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Renewed once a session has less than this left, so an active user is never signed out. */
export const SESSION_RENEW_UNDER_SECONDS = 3 * 24 * 60 * 60;

/** Minimum password length accepted at sign-up. */
export const MIN_PASSWORD_LENGTH = 10;

/**
 * How long an invitation stays acceptable.
 *
 * Short enough that a token found in an old inbox or chat log is usually already dead, long
 * enough to survive someone being away for a week.
 */
export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

export const LIMITS = {
  /** Sign-in attempts per address before the lockout window applies. */
  signInAttempts: 8,
  signInWindowMs: 15 * 60 * 1000,
  /** Writes per session per minute, so one bad client cannot saturate a free-tier database. */
  writesPerMinute: 60,
} as const;
