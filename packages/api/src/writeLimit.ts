/**
 * Per-session write throttling.
 *
 * One session cannot issue more than `LIMITS.writesPerMinute` writes in a rolling minute. The
 * point is not security — a signed-in person can already do anything their role allows — it is
 * that a free-tier database is a shared, small resource, and one runaway client should not be
 * able to exhaust it for everybody.
 *
 * Keyed on the session rather than the user or the address: a session is what a client holds,
 * and it is what can be revoked if one misbehaves.
 */

import { LIMITS } from '@hamscaler/shared';
import { one, run } from './db/index.ts';

export interface WriteAllowance {
  allowed: boolean;
  retryAfterMs: number;
}

interface Row {
  window_start: number;
  writes: number;
}

const WINDOW_MS = 60_000;

/**
 * Counts a write against the session's allowance.
 *
 * The window starts at the first write of a run and is not extended by later ones, so a client
 * sitting exactly on the limit cannot hold the window open indefinitely.
 */
export async function recordWrite(sessionId: string): Promise<WriteAllowance> {
  const now = Date.now();
  const row = await one<Row>(
    'SELECT window_start, writes FROM write_rate WHERE session_id = ?',
    sessionId,
  );

  if (!row || now - row.window_start >= WINDOW_MS) {
    await run(
      `INSERT INTO write_rate (session_id, window_start, writes) VALUES (?, ?, 1)
       ON CONFLICT(session_id) DO UPDATE SET window_start = ?, writes = 1`,
      sessionId,
      now,
      now,
    );
    return { allowed: true, retryAfterMs: 0 };
  }

  const writes = row.writes + 1;
  await run('UPDATE write_rate SET writes = ? WHERE session_id = ?', writes, sessionId);
  if (writes <= LIMITS.writesPerMinute) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: Math.max(0, row.window_start + WINDOW_MS - now) };
}
