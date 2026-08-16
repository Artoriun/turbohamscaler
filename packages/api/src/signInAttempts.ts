/**
 * Sign-in throttling, per email address.
 *
 * Kept in the database rather than in memory because a free-tier host restarts often, and an
 * in-process counter hands an attacker a clean slate every time it does.
 *
 * Per address rather than per IP: an address is what is being attacked, and IPs are shared by
 * everyone behind a corporate NAT. A serious deployment wants both.
 */

import { LIMITS } from '@hamscaler/shared';
import { one, run } from './db/index.ts';

export interface AttemptState {
  failures: number;
  lockedOut: boolean;
  retryAfterMs: number;
}

interface Row {
  failures: number;
  first_at: number;
  last_at: number;
}

export async function recordAttempt(email: string): Promise<AttemptState> {
  const key = email.toLowerCase();
  const now = Date.now();
  const row = await one<Row>(
    'SELECT failures, first_at, last_at FROM sign_in_attempts WHERE email_key = ?',
    key,
  );

  // The window is measured from the first failure in the run, so a steady trickle of attempts
  // cannot keep the window open forever by refreshing it with each try.
  if (!row || now - row.first_at > LIMITS.signInWindowMs) {
    await run(
      `INSERT INTO sign_in_attempts (email_key, failures, first_at, last_at) VALUES (?, 1, ?, ?)
       ON CONFLICT(email_key) DO UPDATE SET failures = 1, first_at = ?, last_at = ?`,
      key,
      now,
      now,
      now,
      now,
    );
    return { failures: 1, lockedOut: false, retryAfterMs: 0 };
  }

  const failures = row.failures + 1;
  await run(
    'UPDATE sign_in_attempts SET failures = ?, last_at = ? WHERE email_key = ?',
    failures,
    now,
    key,
  );
  const lockedOut = failures > LIMITS.signInAttempts;
  return {
    failures,
    lockedOut,
    retryAfterMs: lockedOut ? Math.max(0, row.first_at + LIMITS.signInWindowMs - now) : 0,
  };
}

/** Called on a successful sign-in, so one mistyped password costs nothing an hour later. */
export async function clearAttempts(email: string): Promise<void> {
  await run('DELETE FROM sign_in_attempts WHERE email_key = ?', email.toLowerCase());
}
