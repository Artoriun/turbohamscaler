import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { consoleMailer, type Mail, setMailer } from './mailer.ts';
import { type Actor, as, type Harness, signUp, startApi, unique } from './testing/harness.ts';

/**
 * Invitations and the mailer.
 *
 * The behaviour worth pinning down is not that mail is sent — nothing here sends any — but what
 * the API does differently once something can. With no delivery the token has to come back in
 * the reply for a human to pass on; with delivery it must not, because a live credential in a
 * response body ends up in the browser's memory and in whatever logs sit in between.
 */

/**
 * Node only. `setMailer` swaps a module-level value in *this* process, which reaches the API
 * only while the API is running in it. Under `test:api:worker` the API is a separate Worker,
 * so these would assert against a mailer that was never installed — skipped rather than left
 * to fail, and the behaviour they cover is not runtime-specific.
 */
const skip = Boolean(process.env.API_BASE);

let api: Harness;
let owner: Actor;
const sent: Mail[] = [];

before(async () => {
  api = await startApi();
  owner = await signUp(api.base, 'mail-owner@example.com');
});

after(async () => {
  setMailer(consoleMailer);
  await api.close();
});

const invite = (email: string) =>
  as(owner)(`${api.base}/api/orgs/${owner.orgId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email, role: 'member' }),
  });

describe('with nothing able to deliver', { skip }, () => {
  test('the token comes back, because otherwise it reaches nobody', async () => {
    setMailer(consoleMailer);
    const res = await invite(unique('needs-carrying@example.com'));
    assert.equal(res.status, 201);
    const body = (await res.json()) as { token?: string };
    assert.ok(body.token, 'without a mailer the caller has to be given the token to pass on');
  });
});

describe('with a mailer that delivers', { skip }, () => {
  before(() => {
    sent.length = 0;
    setMailer({
      delivers: true,
      async send(mail) {
        sent.push(mail);
      },
    });
  });

  test('the token is sent, and is not in the reply', async () => {
    const address = unique('gets-an-email@example.com');
    const res = await invite(address);
    assert.equal(res.status, 201);

    const body = (await res.json()) as { token?: string; invitation: { email: string } };
    assert.equal(
      body.token,
      undefined,
      'a live credential must not be returned once it can be delivered instead',
    );
    assert.equal(body.invitation.email, address);

    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, address);
    assert.match(sent[0]?.body ?? '', /invite=/, 'the mail has to carry the link, or it is noise');
  });

  test('the link points at the app, not at the API path that made it', async () => {
    const address = unique('link-check@example.com');
    await invite(address);
    const link = (sent.at(-1)?.body ?? '').match(/https?:\/\/\S+/)?.[0] ?? '';
    assert.match(link, /\/app\?invite=/, `an invitee needs somewhere to land; got ${link}`);
  });
});
