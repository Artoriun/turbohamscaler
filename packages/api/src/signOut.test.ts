import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { LIMITS } from '@hamscaler/shared';
import { as, type Harness, signUp, startApi } from './testing/harness.ts';

/**
 * Signing out — the two routes that had no test at all.
 *
 * `authMatrix.test.ts` covered them, but only to the extent of proving a stranger gets a 401.
 * Nothing asserted that either one actually ends anything, and both were broken: the count came
 * back as a serialised promise because it was never awaited, and a session that had spent its
 * write allowance could not sign out at all, because sign-out is a POST and every POST was
 * charged against that allowance.
 */

let api: Harness;

before(async () => {
  api = await startApi();
});

after(async () => {
  await api.close();
});

describe('signing out', () => {
  test('ends the session it was called with', async () => {
    const actor = await signUp(api.base, 'leaving@example.com');
    assert.equal((await as(actor)(`${api.base}/api/me`)).status, 200);

    const out = await as(actor)(`${api.base}/api/auth/sign-out`, { method: 'POST' });
    assert.equal(out.status, 200);

    // The cookie is still held by the test client; the row behind it is what has to be gone.
    assert.equal((await as(actor)(`${api.base}/api/me`)).status, 401);
  });

  test('everywhere ends every session and says how many', async () => {
    const actor = await signUp(api.base, 'everywhere@example.com');
    // Two more devices for the same person. Signing in rather than forging rows, so the count
    // is over sessions that were really created the way sessions are created.
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${api.base}/api/auth/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: actor.email, password: 'correct-horse-battery' }),
      });
      assert.equal(res.status, 200);
    }

    const res = await as(actor)(`${api.base}/api/auth/sign-out-everywhere`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { ok: boolean; sessions: number };

    // A promise that was never awaited serialises as {}, which is what this used to return —
    // a client asking "how many devices did that just sign out?" got an object.
    assert.equal(
      typeof body.sessions,
      'number',
      `sessions should be a count; got ${JSON.stringify(body.sessions)}`,
    );
    assert.equal(body.sessions, 3, 'all three sessions should have been counted');
    assert.equal((await as(actor)(`${api.base}/api/me`)).status, 401);
  });

  test('is still possible once the write allowance is spent', async () => {
    // The limit exists to keep one client from filling a small database, not to trap anybody in
    // a session they are trying to leave — and least of all in one they are trying to leave
    // because somebody else has it.
    const actor = await signUp(api.base, 'throttled@example.com');
    let refused = false;
    for (let i = 0; i < LIMITS.writesPerMinute + 5; i++) {
      const res = await as(actor)(`${api.base}/api/orgs/${actor.orgId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: `project ${i}` }),
      });
      if (res.status === 429) {
        refused = true;
        break;
      }
    }
    assert.ok(refused, 'the allowance should have run out');

    const out = await as(actor)(`${api.base}/api/auth/sign-out`, { method: 'POST' });
    assert.equal(out.status, 200, 'a throttled session must still be able to sign out');
    assert.equal((await as(actor)(`${api.base}/api/me`)).status, 401);
  });

  test('everywhere is still possible once the write allowance is spent', async () => {
    const actor = await signUp(api.base, 'throttled-everywhere@example.com');
    for (let i = 0; i < LIMITS.writesPerMinute + 5; i++) {
      const res = await as(actor)(`${api.base}/api/orgs/${actor.orgId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: `project ${i}` }),
      });
      if (res.status === 429) break;
    }

    const res = await as(actor)(`${api.base}/api/auth/sign-out-everywhere`, { method: 'POST' });
    assert.equal(res.status, 200, 'the route for a stolen session must not be rate limited');
  });

  test('revoking one session by handle is not rate limited either', async () => {
    const actor = await signUp(api.base, 'revoker@example.com');
    const listed = (await (await as(actor)(`${api.base}/api/me/sessions`)).json()) as {
      sessions: { handle: string }[];
    };
    const handle = listed.sessions[0]?.handle;
    assert.ok(handle);

    for (let i = 0; i < LIMITS.writesPerMinute + 5; i++) {
      const res = await as(actor)(`${api.base}/api/orgs/${actor.orgId}/projects`, {
        method: 'POST',
        body: JSON.stringify({ name: `project ${i}` }),
      });
      if (res.status === 429) break;
    }

    const res = await as(actor)(`${api.base}/api/me/sessions/${handle}/revoke`, { method: 'POST' });
    assert.equal(res.status, 200, 'ending a device you no longer trust must not wait a minute');
  });
});
