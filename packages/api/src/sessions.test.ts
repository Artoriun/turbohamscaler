import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Actor, as, type Harness, signUp, startApi } from './testing/harness.ts';

/**
 * Seeing and revoking your own sessions.
 *
 * "Sign out everywhere" already existed but there was no way to see what "everywhere" was, so
 * the two features people actually reach for — is anything signed in that should not be, and
 * can I end just that one — were invisible and impossible.
 *
 * The property worth guarding hardest is that the list never returns a session id. That id is
 * the cookie value: handing it back would make the page that shows your devices the easiest way
 * to steal one.
 */

const PASSWORD = 'correct-horse-battery';

let api: Harness;
let actor: Actor;

before(async () => {
  api = await startApi();
  actor = await signUp(api.base, 'sessions@example.com');
});

after(async () => {
  await api.close();
});

async function anotherDevice(email: string): Promise<string> {
  const res = await fetch(`${api.base}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
  return (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
}

const list = async (who: Actor) => {
  const res = await as(who)(`${api.base}/api/me/sessions`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    sessions: { handle: string; current: boolean; createdAt: number; expiresAt: number }[];
  };
  return body.sessions;
};

describe('listing them', () => {
  test('shows every device, and marks which one is asking', async () => {
    await anotherDevice(actor.email);
    const sessions = await list(actor);
    assert.ok(sessions.length >= 2, `expected at least two sessions, got ${sessions.length}`);
    assert.equal(
      sessions.filter((s) => s.current).length,
      1,
      'exactly one session is the one making the request',
    );
  });

  test('never returns anything usable as a cookie', async () => {
    const cookie = await anotherDevice(actor.email);
    const value = cookie.split('=')[1] as string;
    const sessions = await list(actor);

    for (const s of sessions) {
      assert.notEqual(s.handle, value, 'the handle must not be the session id');
      assert.ok(s.handle.length < value.length, 'a truncated hash, not the id itself');
    }

    // The decisive check: the handle, used as a cookie, is not a session.
    const res = await fetch(`${api.base}/api/me`, {
      headers: { cookie: `hamscaler_session=${sessions[0]?.handle}` },
    });
    assert.equal(res.status, 401, 'a handle must not authenticate anything');
  });
});

describe('revoking one', () => {
  test('ends that device and leaves the others alone', async () => {
    const doomed = await anotherDevice(actor.email);
    const survivor = await anotherDevice(actor.email);

    // Find the handle belonging to `doomed` by asking as that device: it is the current one.
    const asDoomed = await fetch(`${api.base}/api/me/sessions`, { headers: { cookie: doomed } });
    const { sessions } = (await asDoomed.json()) as {
      sessions: { handle: string; current: boolean }[];
    };
    const handle = sessions.find((s) => s.current)?.handle as string;
    assert.ok(handle);

    const res = await as(actor)(`${api.base}/api/me/sessions/${handle}/revoke`, { method: 'POST' });
    assert.equal(res.status, 200);

    assert.equal(
      (await fetch(`${api.base}/api/me`, { headers: { cookie: doomed } })).status,
      401,
      'the revoked device is signed out',
    );
    assert.equal(
      (await fetch(`${api.base}/api/me`, { headers: { cookie: survivor } })).status,
      200,
      'revoking one device must not sign the others out',
    );
  });

  test('cannot be used against somebody else', async () => {
    const stranger = await signUp(api.base, 'session-stranger@example.com');
    const mine = await list(actor);
    const res = await as(stranger)(`${api.base}/api/me/sessions/${mine[0]?.handle}/revoke`, {
      method: 'POST',
    });
    assert.equal(res.status, 404, 'a handle seen elsewhere must not sign its owner out');
    // And mine still works.
    assert.equal((await as(actor)(`${api.base}/api/me`)).status, 200);
  });

  test('an unknown handle is a 404, not a 500', async () => {
    const res = await as(actor)(`${api.base}/api/me/sessions/deadbeefcafe/revoke`, {
      method: 'POST',
    });
    assert.equal(res.status, 404);
  });
});
