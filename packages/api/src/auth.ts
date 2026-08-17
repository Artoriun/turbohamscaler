/**
 * Passwords and sessions.
 *
 * Self-hosted rather than delegated to a hosted auth provider, because per-monthly-active-user
 * pricing is the one line item that turns a cheap app expensive precisely when it succeeds.
 * The cost here is this file, which is small enough to read in full.
 *
 * Sessions are opaque random ids in a database row, not JWTs. A JWT cannot be revoked without
 * building the very lookup table a session id already is; the trade is one indexed read per
 * request, which SQLite does in microseconds.
 *
 * Password hashing is re-exported from password.ts rather than written here, because that is
 * the part that had to change to run anywhere but Node: `node:crypto`'s scrypt has no Workers
 * equivalent, and Web Crypto does.
 *
 * What is left of `node:crypto` here — randomUUID and a sha256 for session handles — runs on
 * Workers under the `nodejs_compat` flag, which wrangler.toml sets. That flag is load-bearing,
 * not insurance: this file, app.ts and repo.ts all import from `node:crypto` on the request
 * path. Both files used to claim otherwise.
 */

import { createHash, randomUUID } from 'node:crypto';
import { SESSION_RENEW_UNDER_SECONDS, SESSION_TTL_SECONDS } from '@hamscaler/shared';
import { all, one, run } from './db/index.ts';

// Hashing lives in password.ts, written against Web Crypto so the API is not pinned to Node.
export { hashPassword, verifyPassword } from './password.ts';

// ── sessions ─────────────────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'hamscaler_session';

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: number }> {
  const id = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await run(
    'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    id,
    userId,
    expiresAt,
    Date.now(),
  );
  return { id, expiresAt };
}

/**
 * The session behind a cookie, or null.
 *
 * Expired rows are deleted on the way past rather than swept by a job: the read has already
 * found the row, and a session nobody presents costs one row until they do.
 */
export async function readSession(id: string): Promise<SessionRow | null> {
  const row = await one<SessionRow>(
    'SELECT id, user_id, expires_at FROM sessions WHERE id = ?',
    id,
  );
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    await run('DELETE FROM sessions WHERE id = ?', id);
    return null;
  }
  return row;
}

/**
 * Extends a session that is close to expiring, so somebody using the app is never signed out
 * mid-task. Returns the new expiry when it renewed, else null.
 */
export async function renewSession(row: SessionRow): Promise<number | null> {
  const remaining = (row.expires_at - Date.now()) / 1000;
  if (remaining > SESSION_RENEW_UNDER_SECONDS) return null;
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await run('UPDATE sessions SET expires_at = ? WHERE id = ?', expiresAt, row.id);
  return expiresAt;
}

export async function destroySession(id: string): Promise<void> {
  await run('DELETE FROM sessions WHERE id = ?', id);
}

/**
 * The caller's live sessions, identified by a handle rather than by their ids.
 *
 * A session id *is* the credential — it is the cookie value. Listing the real ids would mean
 * handing back a working key for every device the person is signed in on, so a page that exists
 * to show them their sessions would become the easiest way to steal one. The handle is a hash
 * prefix: enough to tell two rows apart and to name one for revocation, useless as a cookie.
 */
export async function sessionsFor(
  userId: string,
): Promise<{ handle: string; createdAt: number; expiresAt: number }[]> {
  const rows = await all<{ id: string; created_at: number; expires_at: number }>(
    'SELECT id, created_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC',
    userId,
    Date.now(),
  );
  return rows.map((r) => ({
    handle: sessionHandle(r.id),
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

/** A non-credential name for a session. Truncated: it identifies, it does not authenticate. */
export function sessionHandle(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 12);
}

/**
 * Ends one session by its handle. Returns false when no session of this user matches.
 *
 * Scoped to the caller's own sessions, so a handle guessed or seen elsewhere cannot be used to
 * sign somebody else out.
 */
export async function destroySessionByHandle(userId: string, handle: string): Promise<boolean> {
  const rows = await all<{ id: string }>('SELECT id FROM sessions WHERE user_id = ?', userId);
  const match = rows.find((r) => sessionHandle(r.id) === handle);
  if (!match) return false;
  return (await run('DELETE FROM sessions WHERE id = ?', match.id)) > 0;
}

/** Signs a user out everywhere — the recovery path when a device is lost or a token leaks. */
export async function destroyAllSessions(userId: string): Promise<number> {
  return await run('DELETE FROM sessions WHERE user_id = ?', userId);
}
