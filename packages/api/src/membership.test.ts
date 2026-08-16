import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { type Actor, as, type Harness, invite, signUp, startApi } from './testing/harness.ts';

/**
 * Changing and ending a membership.
 *
 * Granting access was the easy half. These are the rules about taking it away, and the one
 * that matters most is that an organisation can never be left without an owner — there is no
 * route back from that, because the only people who could fix it are the ones just removed.
 */

let api: Harness;
let owner: Actor;
let admin: Actor;
let member: Actor;
let outsider: Actor;

const membersOf = async (actor: Actor, orgId: string) => {
  const res = await as(actor)(`${api.base}/api/orgs/${orgId}/members`);
  const body = (await res.json()) as { members: { id: string; role: string }[] };
  return body.members;
};

const roleOf = async (actor: Actor, orgId: string, userId: string) =>
  (await membersOf(actor, orgId)).find((m) => m.id === userId)?.role;

before(async () => {
  api = await startApi();
  owner = await signUp(api.base, 'owner@example.com');
  outsider = await signUp(api.base, 'outsider@example.com');
});

beforeEach(async () => {
  // Fresh people each time: these tests remove and demote, so sharing them across cases would
  // make the order they run in part of the result.
  admin = await signUp(api.base, `admin-${randomTag()}@example.com`);
  member = await signUp(api.base, `member-${randomTag()}@example.com`);
  await invite(api.base, owner, admin, 'admin');
  await invite(api.base, owner, member, 'member');
});

after(async () => {
  await api.close();
});

function randomTag() {
  return Math.random().toString(36).slice(2, 8);
}

describe('changing a role', () => {
  test('an admin can promote a member', async () => {
    const res = await as(admin)(`${api.base}/api/orgs/${owner.orgId}/members/${member.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(res.status, 200);
    assert.equal(await roleOf(owner, owner.orgId, member.userId), 'admin');
  });

  test('an admin cannot touch the owner', async () => {
    const res = await as(admin)(`${api.base}/api/orgs/${owner.orgId}/members/${owner.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'member' }),
    });
    assert.equal(res.status, 403, 'an admin demoting the owner who appointed them');
    assert.equal(await roleOf(owner, owner.orgId, owner.userId), 'owner');
  });

  test('only an owner can make another owner', async () => {
    const byAdmin = await as(admin)(
      `${api.base}/api/orgs/${owner.orgId}/members/${member.userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'owner' }),
      },
    );
    assert.equal(byAdmin.status, 403, 'an admin must not be able to hand out more than it holds');

    const byOwner = await as(owner)(
      `${api.base}/api/orgs/${owner.orgId}/members/${member.userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'owner' }),
      },
    );
    assert.equal(byOwner.status, 200);
    assert.equal(await roleOf(owner, owner.orgId, member.userId), 'owner');

    // Put it back, so the owner count is 1 again for the tests that depend on it.
    await as(owner)(`${api.base}/api/orgs/${owner.orgId}/members/${member.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'member' }),
    });
  });

  test('the last owner cannot be demoted', async () => {
    const res = await as(owner)(`${api.base}/api/orgs/${owner.orgId}/members/${owner.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(res.status, 409, 'an organisation with no owner is one nobody can administer');
    assert.equal(await roleOf(owner, owner.orgId, owner.userId), 'owner');
  });

  test('an unknown role is rejected', async () => {
    const res = await as(owner)(`${api.base}/api/orgs/${owner.orgId}/members/${member.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'superuser' }),
    });
    assert.equal(res.status, 400);
  });
});

describe('removing someone', () => {
  test('an admin can remove a member', async () => {
    const res = await as(admin)(`${api.base}/api/orgs/${owner.orgId}/members/${member.userId}`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 200);
    assert.equal(await roleOf(owner, owner.orgId, member.userId), undefined);

    // And the organisation is gone from their side too.
    const me = await as(member)(`${api.base}/api/me`);
    const body = (await me.json()) as { organisations: { id: string }[] };
    assert.ok(!body.organisations.some((o) => o.id === owner.orgId));
  });

  test('an admin cannot remove the owner', async () => {
    const res = await as(admin)(`${api.base}/api/orgs/${owner.orgId}/members/${owner.userId}`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 403);
  });

  test('the last owner cannot be removed', async () => {
    const res = await as(owner)(`${api.base}/api/orgs/${owner.orgId}/members/${owner.userId}`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 409);
  });

  test('a non-member cannot be removed, and asking is a 404', async () => {
    const res = await as(owner)(`${api.base}/api/orgs/${owner.orgId}/members/${outsider.userId}`, {
      method: 'DELETE',
    });
    assert.equal(res.status, 404);
  });
});

describe('leaving', () => {
  test('a member may leave on their own', async () => {
    const res = await as(member)(`${api.base}/api/orgs/${owner.orgId}/leave`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { organisations: { id: string }[] };
    assert.ok(
      !body.organisations.some((o) => o.id === owner.orgId),
      'the reply should be the organisations they have left with',
    );
    assert.equal(await roleOf(owner, owner.orgId, member.userId), undefined);
  });

  test('the last owner may not leave', async () => {
    const res = await as(owner)(`${api.base}/api/orgs/${owner.orgId}/leave`, { method: 'POST' });
    assert.equal(
      res.status,
      409,
      'leaving would strand everyone else in an ownerless organisation',
    );
  });

  test('an outsider leaving an organisation they are not in gets 404', async () => {
    const res = await as(outsider)(`${api.base}/api/orgs/${owner.orgId}/leave`, { method: 'POST' });
    assert.equal(res.status, 404, 'a non-member must not be able to tell it exists');
  });
});
