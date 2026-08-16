import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Actor, as, type Harness, signUp, startApi } from './testing/harness.ts';

/**
 * Tenant isolation: the single highest-value test in a multi-tenant app.
 *
 * Everything here is written from the attacker's side — a legitimate signed-in user of one
 * organisation, holding a valid session, asking for another organisation's data by id. That is
 * the realistic threat, not an anonymous stranger, and it is the one an authentication check
 * alone does nothing about.
 */

let api: Harness;
let alice: Actor;
let mallory: Actor;
let aliceProjectId: string;

before(async () => {
  api = await startApi();
  alice = await signUp(api.base, 'alice@example.com');
  mallory = await signUp(api.base, 'mallory@example.com');
  const res = await as(alice)(`${api.base}/api/orgs/${alice.orgId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Alice private plans', notes: 'commercially sensitive' }),
  });
  aliceProjectId = ((await res.json()) as { project: { id: string } }).project.id;
});

after(async () => {
  await api.close();
});

describe('a signed-in user of another organisation', () => {
  test('cannot list its projects', async () => {
    const res = await as(mallory)(`${api.base}/api/orgs/${alice.orgId}/projects`);
    assert.equal(res.status, 404, 'listing another org must not succeed');
  });

  test('cannot read one of its projects by id', async () => {
    // The id is a real one and the session is valid. Only the org filter in the query stands
    // between Mallory and the row.
    const res = await as(mallory)(`${api.base}/api/orgs/${alice.orgId}/projects/${aliceProjectId}`);
    assert.equal(res.status, 404);
  });

  test("cannot reach it by passing its own org id with the other org's project id", async () => {
    // The subtler shape: the org in the URL is one Mallory *is* a member of, so the membership
    // check passes. Only the org_id in the WHERE clause stops the read.
    const res = await as(mallory)(
      `${api.base}/api/orgs/${mallory.orgId}/projects/${aliceProjectId}`,
    );
    assert.equal(res.status, 404, 'a project id from another org must not resolve');
  });

  test('cannot update or delete its projects', async () => {
    const patch = await as(mallory)(
      `${api.base}/api/orgs/${alice.orgId}/projects/${aliceProjectId}`,
      { method: 'PATCH', body: JSON.stringify({ name: 'owned' }) },
    );
    assert.equal(patch.status, 404);

    const del = await as(mallory)(
      `${api.base}/api/orgs/${alice.orgId}/projects/${aliceProjectId}`,
      {
        method: 'DELETE',
      },
    );
    assert.equal(del.status, 404);

    // And the row is untouched, which is the assertion that would catch a handler that
    // returned an error *after* writing.
    const still = await as(alice)(`${api.base}/api/orgs/${alice.orgId}/projects/${aliceProjectId}`);
    assert.equal(still.status, 200);
    const { project } = (await still.json()) as { project: { name: string } };
    assert.equal(project.name, 'Alice private plans');
  });

  test('cannot list its members', async () => {
    const res = await as(mallory)(`${api.base}/api/orgs/${alice.orgId}/members`);
    assert.equal(res.status, 404);
  });

  test('cannot invite itself into the organisation', async () => {
    const res = await as(mallory)(`${api.base}/api/orgs/${alice.orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify({ email: mallory.email, role: 'admin' }),
    });
    assert.equal(res.status, 404);
    // Alice's member list is unchanged.
    const members = await as(alice)(`${api.base}/api/orgs/${alice.orgId}/members`);
    const body = (await members.json()) as { members: { email: string }[] };
    assert.deepEqual(
      body.members.map((m) => m.email),
      ['alice@example.com'],
    );
  });

  test('is told nothing about whether the organisation exists', async () => {
    // 404 for both a real org they cannot see and one that does not exist. A 403 on the first
    // would confirm the id is real, which is a membership oracle for anyone enumerating.
    const real = await as(mallory)(`${api.base}/api/orgs/${alice.orgId}/projects`);
    const fake = await as(mallory)(
      `${api.base}/api/orgs/00000000-0000-0000-0000-000000000000/projects`,
    );
    assert.equal(real.status, fake.status);
    assert.deepEqual(await real.json(), await fake.json());
  });
});

describe('the owner of an organisation', () => {
  test('sees exactly their own projects', async () => {
    await as(mallory)(`${api.base}/api/orgs/${mallory.orgId}/projects`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Mallory plans' }),
    });
    const res = await as(alice)(`${api.base}/api/orgs/${alice.orgId}/projects`);
    const { projects } = (await res.json()) as { projects: { name: string }[] };
    assert.deepEqual(
      projects.map((p) => p.name),
      ['Alice private plans'],
      'a list must not bleed rows from another tenant',
    );
  });
});

describe('sign-up', () => {
  test('two people with the same name can both sign up', async () => {
    // The slug carried `Date.now() % 10000`, which repeats every ten seconds: the second
    // person with that name inside the window hit a UNIQUE constraint on organisations.slug
    // and got a 500 instead of an account. Same name, different addresses, is the case.
    const api2 = await startApi();
    try {
      const post = (email: string) =>
        fetch(`${api2.base}/api/auth/sign-up`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: 'Alex Taylor', password: 'correct-horse-battery' }),
        });
      // A burst, not two calls: `Date.now() % 10000` only repeats for sign-ups landing in the
      // same millisecond, so two sequential requests almost never collide and a two-call test
      // passes against the bug. Twenty in flight at once reliably do.
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => post(`alex${i}@example.com`)),
      );
      const statuses = results.map((r) => r.status);
      assert.deepEqual(
        statuses.filter((s) => s !== 201),
        [],
        'every sign-up sharing a name must get its own organisation slug',
      );
    } finally {
      await api2.close();
    }
  });
});
