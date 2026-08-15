/**
 * Types and constants shared by the API and the web app.
 *
 * Ships raw TypeScript (`main` points at this file) and is loaded three ways: by `tsc` when it
 * compiles the API, by Node's type stripping under the test runner, and by Vite. Those have
 * incompatible rules about relative import specifiers, so this package deliberately stays a
 * single module with no relative imports of its own.
 */

export const APP_NAME = 'TurboHamscaler';

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

export const LIMITS = {
  /** Sign-in attempts per address before the lockout window applies. */
  signInAttempts: 8,
  signInWindowMs: 15 * 60 * 1000,
  /** Writes per session per minute, so one bad client cannot saturate a free-tier database. */
  writesPerMinute: 60,
} as const;
