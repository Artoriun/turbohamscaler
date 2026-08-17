import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { LIMITS } from '@hamscaler/shared';
import { sweepExpired } from './auth.ts';
import { all, run } from './db/index.ts';
import { type Actor, as, type Harness, signUp, startApi } from './testing/harness.ts';

/**
 * The sweep, which is the only thing that ever removes a session nobody comes back to.
 *
 * Reaches into the tables directly, unlike most of the suite. There is no way to age a row
 * through the API — waiting out a session's lifetime is not a test anybody would run — and the
 * behaviour under test is precisely what happens to rows that time has passed by.
 */

/** Node only: it manipulates the database this process opened, which a Worker does not share. */
const skip = Boolean(process.env.API_BASE);

let api: Harness;
let actor: Actor;

before(async () => {
  api = await startApi();
  actor = await signUp(api.base, 'sweeper@example.com');
});

after(async () => {
  await api.close();
});

describe('sweeping what expired', { skip }, () => {
  test('removes sessions nobody came back to, and leaves live ones alone', async () => {
    const before = await all<{ id: string }>('SELECT id FROM sessions', []);
    assert.ok(before.length >= 1, 'the signed-up actor should hold a session');

    // A session that lapsed and was never presented again — a closed browser, a replaced phone.
    await run(
      'INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      'abandoned-session',
      actor.userId,
      Date.now() - 1000,
      Date.now() - 100_000,
    );

    const swept = await sweepExpired();
    assert.ok(swept.sessions >= 1, `expected the lapsed session to go; swept ${swept.sessions}`);

    const remaining = await all<{ id: string }>('SELECT id FROM sessions', []);
    assert.ok(
      !remaining.some((r) => r.id === 'abandoned-session'),
      'the expired session should be gone',
    );
    // The live one has to survive, or the sweep is just a sign-out for everybody.
    assert.equal((await as(actor)(`${api.base}/api/me`)).status, 200);
  });

  test('removes sign-in attempts past their window, and keeps current ones', async () => {
    const now = Date.now();
    await run(
      'INSERT INTO sign_in_attempts (email_key, failures, first_at, last_at) VALUES (?, ?, ?, ?)',
      'ancient@example.com',
      5,
      now - 10 * LIMITS.signInWindowMs,
      now - 10 * LIMITS.signInWindowMs,
    );
    await run(
      'INSERT INTO sign_in_attempts (email_key, failures, first_at, last_at) VALUES (?, ?, ?, ?)',
      'current@example.com',
      2,
      now,
      now,
    );

    await sweepExpired();

    const keys = (
      await all<{ email_key: string }>('SELECT email_key FROM sign_in_attempts', [])
    ).map((r) => r.email_key);
    assert.ok(!keys.includes('ancient@example.com'), 'an attempt past its window is decoration');
    assert.ok(
      keys.includes('current@example.com'),
      'a count inside its window is still doing its job — dropping it resets a lockout',
    );
  });
});
