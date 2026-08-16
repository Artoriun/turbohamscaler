import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { type Actor, as, type Harness, signUp, startApi } from './testing/harness.ts';

/**
 * Joining an organisation you did not create.
 *
 * The route this replaced took an address, looked the user up, and answered 404 "no-such-user"
 * when nobody held it — so any signed-in person could ask "is this address registered?" one
 * address at a time. Sign-in refuses to answer that question; this made it answerable anyway.
 * The first test below is the one that would catch it coming back.
 */

let api: Harness;
let owner: Actor;
let guest: Actor;
let outsider: Actor;

before(async () => {
  api = await startApi();
  owner = await signUp(api.base, 'owner@example.com');
  guest = await signUp(api.base, 'guest@example.com');
  outsider = await signUp(api.base, 'outsider@example.com');
});

after(async () => {
  await api.close();
});

const inviteAs = (actor: Actor, orgId: string, email: string, role = 'member') =>
  as(actor)(`${api.base}/api/orgs/${orgId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });

describe('inviting', () => {
  test('says nothing about whether the address has an account', async () => {
    const registered = await inviteAs(owner, owner.orgId, 'guest@example.com');
    const unknown = await inviteAs(owner, owner.orgId, 'nobody-at-all@example.com');

    assert.equal(registered.status, 201);
    assert.equal(
      unknown.status,
      201,
      'inviting an unregistered address must succeed exactly like a registered one, or the ' +
        'reply tells the caller which addresses have accounts',
    );

    // Clean up so the partial unique index does not block the later tests.
    const body = (await unknown.json()) as { invitation: { id: string } };
    await as(owner)(`${api.base}/api/orgs/${owner.orgId}/invitations/${body.invitation.id}`, {
      method: 'DELETE',
    });
  });

  test('refuses a second outstanding invitation for the same address', async () => {
    const again = await inviteAs(owner, owner.orgId, 'guest@example.com');
    assert.equal(again.status, 409);
  });

  test('a plain member may not invite', async () => {
    const res = await inviteAs(outsider, outsider.orgId, 'someone@example.com', 'nonsense');
    assert.equal(res.status, 400, 'an unknown role is rejected before anything is written');
  });
});

describe('accepting', () => {
  let token: string;

  test('the token opens the invitation, naming the organisation', async () => {
    const list = await as(owner)(`${api.base}/api/orgs/${owner.orgId}/invitations`);
    const { invitations } = (await list.json()) as { invitations: { email: string }[] };
    assert.ok(
      invitations.some((i) => i.email === 'guest@example.com'),
      'the invitation should be listed for the organisation that issued it',
    );

    // Issue a fresh one to hold a token: the token is returned once and never stored.
    await as(owner)(
      `${api.base}/api/orgs/${owner.orgId}/invitations/${
        (
          (await (await as(owner)(`${api.base}/api/orgs/${owner.orgId}/invitations`)).json()) as {
            invitations: { id: string; email: string }[];
          }
        ).invitations.find((i) => i.email === 'guest@example.com')?.id
      }`,
      { method: 'DELETE' },
    );
    const made = await inviteAs(owner, owner.orgId, guest.email, 'member');
    assert.equal(made.status, 201);
    token = ((await made.json()) as { token: string }).token;

    const opened = await as(guest)(`${api.base}/api/invitations/${token}`);
    assert.equal(opened.status, 200);
    const seen = (await opened.json()) as { organisation: { id: string } };
    assert.equal(seen.organisation.id, owner.orgId);
  });

  test('is refused for an account it was not addressed to', async () => {
    const res = await as(outsider)(`${api.base}/api/invitations/${token}/accept`, {
      method: 'POST',
    });
    assert.equal(
      res.status,
      403,
      'a forwarded invitation must not be a way into someone else’s organisation',
    );
  });

  test('an anonymous caller cannot open one', async () => {
    const res = await as(null)(`${api.base}/api/invitations/${token}`);
    assert.equal(res.status, 401, 'holding a token is not the same as being allowed to read it');
  });

  test('the addressee joins, once', async () => {
    const first = await as(guest)(`${api.base}/api/invitations/${token}/accept`, {
      method: 'POST',
    });
    assert.equal(first.status, 201);
    const { organisations } = (await first.json()) as { organisations: { id: string }[] };
    assert.ok(organisations.some((o) => o.id === owner.orgId));

    // Single-use: the same token a second time is spent, not a second membership.
    const second = await as(guest)(`${api.base}/api/invitations/${token}/accept`, {
      method: 'POST',
    });
    assert.equal(second.status, 404);

    const members = await as(owner)(`${api.base}/api/orgs/${owner.orgId}/members`);
    const body = (await members.json()) as { members: { email: string }[] };
    assert.equal(
      body.members.filter((m) => m.email === guest.email).length,
      1,
      'accepting twice must not produce two memberships',
    );
  });

  test('an unknown token is not found', async () => {
    const res = await as(guest)(`${api.base}/api/invitations/no-such-token/accept`, {
      method: 'POST',
    });
    assert.equal(res.status, 404);
  });
});
