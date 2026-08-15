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
 */

import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SESSION_RENEW_UNDER_SECONDS, SESSION_TTL_SECONDS } from '@hamscaler/shared';
import { one, run } from './db/index.ts';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

// scrypt from node:crypto rather than argon2: no native dependency, and the parameters below
// are the expensive part either way. N=2^15 is roughly 100ms on a laptop — slow enough to make
// offline guessing costly, fast enough that a sign-in does not feel stalled.
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expected] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const derived = await scrypt(password, salt, KEYLEN);
  const expectedBuf = Buffer.from(expected, 'hex');
  // Length check first: timingSafeEqual throws on a mismatch rather than returning false.
  if (expectedBuf.length !== derived.length) return false;
  return timingSafeEqual(derived, expectedBuf);
}

// ── sessions ─────────────────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'hamscaler_session';

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
}

export function createSession(userId: string): { id: string; expiresAt: number } {
  const id = randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  run(
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
export function readSession(id: string): SessionRow | null {
  const row = one<SessionRow>('SELECT id, user_id, expires_at FROM sessions WHERE id = ?', id);
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    run('DELETE FROM sessions WHERE id = ?', id);
    return null;
  }
  return row;
}

/**
 * Extends a session that is close to expiring, so somebody using the app is never signed out
 * mid-task. Returns the new expiry when it renewed, else null.
 */
export function renewSession(row: SessionRow): number | null {
  const remaining = (row.expires_at - Date.now()) / 1000;
  if (remaining > SESSION_RENEW_UNDER_SECONDS) return null;
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  run('UPDATE sessions SET expires_at = ? WHERE id = ?', expiresAt, row.id);
  return expiresAt;
}

export function destroySession(id: string): void {
  run('DELETE FROM sessions WHERE id = ?', id);
}

/** Signs a user out everywhere — the recovery path when a device is lost or a token leaks. */
export function destroyAllSessions(userId: string): number {
  return run('DELETE FROM sessions WHERE user_id = ?', userId);
}
