import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { LIMITS } from '@hamscaler/shared';
import { type Harness, signUp, startApi } from './testing/harness.ts';

/**
 * The sign-in lockout, from the outside.
 *
 * signInAttempts.ts already counted failures and computed a wait, and the route already sent
 * both — but nothing asserted it, and the sign-in form threw `retryAfterMs` away and showed
 * "those details were not accepted" instead. A lockout that reads as a wrong password is a
 * support call from someone typing the right one.
 *
 * Pinned here because the form now counts that number down: if the route stops sending it,
 * the countdown silently becomes a dead form with no explanation.
 */

const EMAIL = 'lockout@example.com';
const PASSWORD = 'correct-horse-battery';

let api: Harness;

before(async () => {
  api = await startApi();
  await signUp(api.base, EMAIL);
});
after(async () => {
  await api.close();
});

const attempt = (password: string) =>
  fetch(`${api.base}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
  });

describe('sign-in lockout', () => {
  test('locks after the configured attempts and says how long to wait', async () => {
    let locked: Response | null = null;
    // One past the limit: the check is `failures > signInAttempts`, so the lockout lands on
    // the attempt after the last allowed one.
    for (let i = 0; i < LIMITS.signInAttempts + 1; i++) {
      const res = await attempt('wrong-password-entirely');
      if (res.status === 429) {
        locked = res;
        break;
      }
      assert.equal(res.status, 401, `attempt ${i + 1} should be a plain refusal`);
    }

    assert.ok(locked, `expected a lockout within ${LIMITS.signInAttempts + 1} attempts`);
    const body = (await locked.json()) as { error: string; retryAfterMs: number };
    assert.equal(body.error, 'too-many-attempts');
    assert.ok(
      body.retryAfterMs > 0 && body.retryAfterMs <= LIMITS.signInWindowMs,
      `the form counts this down, so it has to be a real wait; got ${body.retryAfterMs}`,
    );
  });

  test('the right password is refused too while locked', async () => {
    // Worth stating: the lockout is on the address, so it does not matter that this attempt
    // would otherwise succeed. Anything else would make the lock trivially bypassable.
    const res = await attempt(PASSWORD);
    assert.equal(res.status, 429);
  });
});
