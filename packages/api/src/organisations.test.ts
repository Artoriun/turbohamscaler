import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Actor, as, type Harness, invite, signUp, startApi } from './testing/harness.ts';

/**
 * Creating, renaming and deleting an organisation.
 *
 * Sign-up gave everyone exactly one and no way to make another, so leaving or deleting it left
 * a person signed in with nowhere to be. These are the routes that make an organisation a thing
 * you manage rather than a thing you were issued.
 */

let api: Harness;
let owner: Actor;
let outsider: Actor;

const orgsOf = async (actor: Actor) => {
  const res = await as(actor)(`${api.base}/api/me`);
  const body = (await res.json()) as { organisations: { id: string; name: string }[] };
  return body.organisations;
};

before(async () => {
  api = await startApi();
  owner = await signUp(api.base, 'org-owner@example.com');
  outsider = await signUp(api.base, 'org-outsider@example.com');
});

after(async () => {
  await api.close();
});

describe('creating one', () => {
  test('anyone signed in may start an organisation and owns it', async () => {
    const res = await as(owner)(`${api.base}/api/orgs`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Second workspace' }),
    });
    assert.equal(res.status, 201);
    const { organisation, organisations } = (await res.json()) as {
      organisation: { id: string; slug: string };
      organisations: { id: string; role: string }[];
    };
    assert.equal(organisations.find((o) => o.id === organisation.id)?.role, 'owner');
    assert.ok(organisation.slug.startsWith('second-workspace-'), organisation.slug);
  });

  test('a blank name is refused', async () => {
    const res = await as(owner)(`${api.base}/api/orgs`, {
      method: 'POST',
      body: JSON.stringify({ name: '   ' }),
    });
    assert.equal(res.status, 400);
  });
});

describe('renaming', () => {
  test('an admin can rename it, and everyone sees the new name', async () => {
    const admin = await signUp(api.base, 'org-admin@example.com');
    await invite(api.base, owner, admin, 'admin');

    const res = await as(admin)(`${api.base}/api/orgs/${owner.orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed by an admin' }),
    });
    assert.equal(res.status, 200);
    assert.equal(
      (await orgsOf(owner)).find((o) => o.id === owner.orgId)?.name,
      'Renamed by an admin',
    );
  });

  test('an outsider renaming it cannot even tell it exists', async () => {
    const res = await as(outsider)(`${api.base}/api/orgs/${owner.orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Mine now' }),
    });
    assert.equal(res.status, 404);
  });
});

describe('deleting', () => {
  test('it disappears for every member, along with its projects', async () => {
    const boss = await signUp(api.base, 'doomed-owner@example.com');
    const member = await signUp(api.base, 'doomed-member@example.com');
    await invite(api.base, boss, member, 'member');

    await as(boss)(`${api.base}/api/orgs/${boss.orgId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Doomed project' }),
    });

    const res = await as(boss)(`${api.base}/api/orgs/${boss.orgId}`, { method: 'DELETE' });
    assert.equal(res.status, 200);

    assert.ok(!(await orgsOf(boss)).some((o) => o.id === boss.orgId));
    assert.ok(
      !(await orgsOf(member)).some((o) => o.id === boss.orgId),
      'the other member should not be left holding a membership of nothing',
    );

    // Note what this does *not* prove: a 404 here only says the caller is no longer a member.
    // Deleting the memberships and leaving the organisation and its projects behind passes this
    // too, which is why the cascade is checked against the schema in cascade.test.ts instead.
    const projects = await as(boss)(`${api.base}/api/orgs/${boss.orgId}/projects`);
    assert.equal(projects.status, 404, 'the organisation is unreachable for its former owner');
  });

  test('an admin may not delete it — only an owner', async () => {
    const boss = await signUp(api.base, 'kept-owner@example.com');
    const admin = await signUp(api.base, 'kept-admin@example.com');
    await invite(api.base, boss, admin, 'admin');

    const res = await as(admin)(`${api.base}/api/orgs/${boss.orgId}`, { method: 'DELETE' });
    assert.equal(res.status, 403, 'deleting everything is not an administrative act');
    assert.ok((await orgsOf(boss)).some((o) => o.id === boss.orgId));
  });

  test('deleting your only organisation leaves you able to make another', async () => {
    // The state this route exists to make survivable: signed in, belonging to nothing.
    const lonely = await signUp(api.base, 'lonely@example.com');
    await as(lonely)(`${api.base}/api/orgs/${lonely.orgId}`, { method: 'DELETE' });
    assert.deepEqual(await orgsOf(lonely), []);

    const made = await as(lonely)(`${api.base}/api/orgs`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Starting over' }),
    });
    assert.equal(made.status, 201);
    assert.equal((await orgsOf(lonely)).length, 1);
  });
});
