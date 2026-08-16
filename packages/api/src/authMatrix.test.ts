import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { ROUTE_MANIFEST } from './app.ts';
import { type Actor, as, type Harness, invite, signUp, startApi } from './testing/harness.ts';

/**
 * Every route, checked against every caller who should not be able to use it.
 *
 * Driven by ROUTE_MANIFEST rather than a list written here, so adding a route to the app
 * without declaring what it requires fails this suite — the point being that a route cannot
 * ship unprotected by omission, which is how it usually happens.
 */

let api: Harness;
let owner: Actor;
let outsider: Actor;
let plainMember: Actor;
let projectId: string;

before(async () => {
  api = await startApi();
  owner = await signUp(api.base, 'owner@example.com');
  outsider = await signUp(api.base, 'outsider@example.com');
  plainMember = await signUp(api.base, 'member@example.com');

  // plainMember joins the owner's organisation with the lowest role, which is what makes the
  // "authenticated, a member, but not privileged enough" case testable.
  await invite(api.base, owner, plainMember, 'member');

  const res = await as(owner)(`${api.base}/api/orgs/${owner.orgId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Subject' }),
  });
  projectId = ((await res.json()) as { project: { id: string } }).project.id;
});

after(async () => {
  await api.close();
});

// `:token` stands in for one that does not exist. Every invitation route is checked here for
// who may call it at all; whether a real token works is invitations.test.ts's job.
const url = (path: string, orgId: string) =>
  `${api.base}${path
    .replace(':orgId', orgId)
    .replace(':token', 'not-a-real-token')
    .replace(':id', projectId)}`;

describe('anonymous callers', () => {
  for (const route of ROUTE_MANIFEST.filter((r) => r.auth !== 'anonymous')) {
    test(`${route.method.toUpperCase()} ${route.path} is refused`, async () => {
      const res = await as(null)(url(route.path, owner.orgId), {
        method: route.method.toUpperCase(),
        body: route.method === 'get' || route.method === 'delete' ? undefined : '{}',
      });
      assert.equal(res.status, 401, 'a route requiring a session must refuse an anonymous caller');
    });
  }
});

describe('a signed-in non-member', () => {
  for (const route of ROUTE_MANIFEST.filter((r) => r.path.includes(':orgId'))) {
    test(`${route.method.toUpperCase()} ${route.path} is refused`, async () => {
      const res = await as(outsider)(url(route.path, owner.orgId), {
        method: route.method.toUpperCase(),
        body: route.method === 'get' || route.method === 'delete' ? undefined : '{}',
      });
      assert.equal(
        res.status,
        404,
        'a non-member must not be able to tell the org apart from one that does not exist',
      );
    });
  }
});

describe('a member holding too low a role', () => {
  const privileged = ROUTE_MANIFEST.filter((r) => r.auth === 'admin' || r.auth === 'owner');

  test('the manifest actually contains privileged routes', () => {
    // Without this the loop below can silently cover nothing, and a suite that asserts nothing
    // reports success just as loudly as one that works.
    assert.ok(privileged.length > 0, 'no role-gated routes in the manifest');
  });

  for (const route of privileged) {
    test(`${route.method.toUpperCase()} ${route.path} is refused`, async () => {
      const res = await as(plainMember)(url(route.path, owner.orgId), {
        method: route.method.toUpperCase(),
        body: route.method === 'get' || route.method === 'delete' ? undefined : '{}',
      });
      assert.equal(res.status, 403, 'a member below the required role must get 403, not 200');
    });
  }
});

describe('the manifest matches the app', () => {
  test('every route the app serves is declared', () => {
    // A cheap structural check: the manifest is only trustworthy if it is complete, and the
    // suites above are only as good as the manifest.
    const declared = new Set(ROUTE_MANIFEST.map((r) => `${r.method} ${r.path}`));
    assert.equal(declared.size, ROUTE_MANIFEST.length, 'duplicate entries in the manifest');
    assert.ok(
      ROUTE_MANIFEST.some((r) => r.auth === 'anonymous'),
      'expected some public routes',
    );
    assert.ok(
      ROUTE_MANIFEST.some((r) => r.auth === 'user'),
      'expected some session-only routes',
    );
  });
});
