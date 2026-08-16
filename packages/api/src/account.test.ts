import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Actor, as, type Harness, invite, signUp, startApi } from './testing/harness.ts';

/**
 * Changing your own name and password, and closing the account.
 *
 * The password route is the one with teeth. It asks for the current password even though the
 * caller is already signed in, and it ends every other session — both because the situation it
 * exists for is "someone else has my password", and neither omission is visible from a happy
 * path that only checks the new password works afterwards.
 */

const PASSWORD = 'correct-horse-battery';

let api: Harness;
let actor: Actor;

before(async () => {
  api = await startApi();
  actor = await signUp(api.base, 'account@example.com');
});

after(async () => {
  await api.close();
});

/** A second signed-in session for the same person, as a second device would be. */
async function secondDevice(email: string, password = PASSWORD): Promise<Actor> {
  const res = await fetch(`${api.base}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  // Read the body once. A template literal in the assertion message is evaluated whether or not
  // the assertion fails, so `${await res.text()}` here consumed it before res.json() could.
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string }; organisations: { id: string }[] };
  return {
    cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] as string,
    userId: body.user.id,
    email,
    orgId: body.organisations[0]?.id as string,
  };
}

describe('changing your name', () => {
  test('takes effect and is visible on the next request', async () => {
    const res = await as(actor)(`${api.base}/api/me`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed Person' }),
    });
    assert.equal(res.status, 200);
    const me = await (await as(actor)(`${api.base}/api/me`)).json();
    assert.equal((me as { user: { name: string } }).user.name, 'Renamed Person');
  });

  test('a blank name is refused', async () => {
    const res = await as(actor)(`${api.base}/api/me`, {
      method: 'PATCH',
      body: JSON.stringify({ name: '  ' }),
    });
    assert.equal(res.status, 400);
  });
});

describe('changing your password', () => {
  test('the current password is required, even while signed in', async () => {
    const person = await signUp(api.base, 'pw-guard@example.com');
    const res = await as(person)(`${api.base}/api/me/password`, {
      method: 'POST',
      body: JSON.stringify({ current: 'not-the-password', next: 'a-brand-new-password' }),
    });
    assert.equal(
      res.status,
      403,
      'without this, anyone who finds an unlocked screen owns the account',
    );
    // And the old password still works, so nothing was changed on the way to refusing.
    await secondDevice(person.email);
  });

  test('a weak new password is refused', async () => {
    const person = await signUp(api.base, 'pw-weak@example.com');
    const res = await as(person)(`${api.base}/api/me/password`, {
      method: 'POST',
      body: JSON.stringify({ current: PASSWORD, next: 'short' }),
    });
    assert.equal(res.status, 400);
  });

  test('it ends every other session, and keeps this one', async () => {
    const person = await signUp(api.base, 'pw-change@example.com');
    const other = await secondDevice(person.email);
    // Both sessions work to begin with, or the assertion below proves nothing.
    assert.equal((await as(other)(`${api.base}/api/me`)).status, 200);

    const res = await as(person)(`${api.base}/api/me/password`, {
      method: 'POST',
      body: JSON.stringify({ current: PASSWORD, next: 'a-brand-new-password' }),
    });
    assert.equal(res.status, 200);

    assert.equal(
      (await as(other)(`${api.base}/api/me`)).status,
      401,
      'the reason to change a password is that someone else may have it',
    );

    // The caller is issued a fresh cookie rather than being signed out by their own change.
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
    assert.equal((await as({ ...person, cookie })(`${api.base}/api/me`)).status, 200);

    // The new password is the one that works now.
    await secondDevice(person.email, 'a-brand-new-password');
  });
});

describe('closing the account', () => {
  test('is refused while it is the only owner of an organisation', async () => {
    const boss = await signUp(api.base, 'sole-owner@example.com');
    const res = await as(boss)(`${api.base}/api/me`, { method: 'DELETE' });
    assert.equal(res.status, 409);
    const body = (await res.json()) as { organisations: { id: string }[] };
    assert.ok(
      body.organisations.some((o) => o.id === boss.orgId),
      'the reply has to name what is in the way, or there is nothing to act on',
    );
  });

  test('succeeds once nothing would be orphaned, and the session dies with it', async () => {
    const leaver = await signUp(api.base, 'closing@example.com');
    const heir = await signUp(api.base, 'heir@example.com');
    await invite(api.base, leaver, heir, 'member');

    // Hand ownership over, then step down to nothing.
    await as(leaver)(`${api.base}/api/orgs/${leaver.orgId}/members/${heir.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'owner' }),
    });
    await as(leaver)(`${api.base}/api/orgs/${leaver.orgId}/leave`, { method: 'POST' });

    const res = await as(leaver)(`${api.base}/api/me`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal((await as(leaver)(`${api.base}/api/me`)).status, 401);

    // The organisation is still there, with its new owner.
    const members = await as(heir)(`${api.base}/api/orgs/${leaver.orgId}/members`);
    assert.equal(members.status, 200);
    const body = (await members.json()) as { members: { id: string }[] };
    assert.deepEqual(
      body.members.map((m) => m.id),
      [heir.userId],
      'the workspace survives its founder closing their account',
    );
  });
});
