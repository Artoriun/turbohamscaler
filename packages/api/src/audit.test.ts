import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Actor, as, type Harness, invite, signUp, startApi } from './testing/harness.ts';

/**
 * The record of what happened, which the other tables cannot answer.
 *
 * Membership and invitation rows only hold the current state: someone invited, admitted and
 * removed again leaves nothing behind at all. These check that the trail is written by the
 * routes that change things, and that it is not readable by everyone in the organisation.
 */

let api: Harness;
let owner: Actor;
let member: Actor;
let outsider: Actor;

const auditFor = async (actor: Actor, orgId: string) => {
  const res = await as(actor)(`${api.base}/api/orgs/${orgId}/audit`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    events: { action: string; subject: string; detail: string }[];
  };
  return body.events;
};

before(async () => {
  api = await startApi();
  owner = await signUp(api.base, 'owner@example.com');
  member = await signUp(api.base, 'member@example.com');
  outsider = await signUp(api.base, 'outsider@example.com');
});

after(async () => {
  await api.close();
});

describe('what gets recorded', () => {
  test('an invitation, its acceptance, a role change and a removal all leave a trail', async () => {
    await invite(api.base, owner, member, 'member');

    await as(owner)(`${api.base}/api/orgs/${owner.orgId}/members/${member.userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'admin' }),
    });
    await as(owner)(`${api.base}/api/orgs/${owner.orgId}/members/${member.userId}`, {
      method: 'DELETE',
    });

    const events = await auditFor(owner, owner.orgId);
    const actions = events.map((e) => e.action);
    for (const expected of [
      'invitation.created',
      'invitation.accepted',
      'member.role-changed',
      'member.removed',
    ]) {
      assert.ok(
        actions.includes(expected),
        `${expected} should be recorded; got ${actions.join(', ')}`,
      );
    }

    // Newest first, so the log opens on what just happened.
    assert.equal(actions[0], 'member.removed');

    const changed = events.find((e) => e.action === 'member.role-changed');
    assert.equal(
      changed?.detail,
      'member → admin',
      'a role change is only useful if it says what it changed from',
    );
    assert.equal(changed?.subject, member.email);
  });

  test('leaving is recorded by the person who left', async () => {
    const leaver = await signUp(api.base, `leaver-${Date.now()}@example.com`);
    await invite(api.base, owner, leaver, 'member');
    await as(leaver)(`${api.base}/api/orgs/${owner.orgId}/leave`, { method: 'POST' });

    const events = await auditFor(owner, owner.orgId);
    const left = events.find((e) => e.action === 'member.left');
    assert.ok(left, 'leaving should be recorded');
    assert.ok(
      left?.subject.includes(leaver.email),
      'the record has to name who left, since their membership row is gone',
    );
  });

  test('the actor is named, not just referenced', async () => {
    const events = await auditFor(owner, owner.orgId);
    const anyEvent = events[0] as unknown as { actorLabel: string };
    assert.ok(
      anyEvent.actorLabel.includes('@'),
      'an id alone stops meaning anything once the account is deleted',
    );
  });
});

describe('who may read it', () => {
  test('a plain member may not', async () => {
    const plain = await signUp(api.base, `plain-${Date.now()}@example.com`);
    await invite(api.base, owner, plain, 'member');
    const res = await as(plain)(`${api.base}/api/orgs/${owner.orgId}/audit`);
    assert.equal(res.status, 403);
  });

  test('an outsider cannot tell the organisation exists', async () => {
    const res = await as(outsider)(`${api.base}/api/orgs/${owner.orgId}/audit`);
    assert.equal(res.status, 404);
  });

  test('one organisation cannot read another’s', async () => {
    const events = await auditFor(outsider, outsider.orgId);
    assert.deepEqual(events, [], 'a fresh organisation has its own, empty, log');
  });
});
