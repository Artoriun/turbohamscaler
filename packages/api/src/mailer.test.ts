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

describe('with a mailer that fails', { skip }, () => {
  before(() => {
    setMailer({
      delivers: true,
      async send() {
        throw new Error('SMTP 421 service unavailable');
      },
    });
  });

  test('says the invitation was made, and hands back the token to pass on by hand', async () => {
    // This used to answer 409 "already-invited". Every part of that was wrong: the address had
    // not been invited before, the invitation had in fact just been created, and the token —
    // the only way to reach the person now that the mail had not — was thrown away with the
    // response. Retrying then hit the unique index and returned the same 409, which is how an
    // admin learns nothing at all.
    const address = unique('mailer-down@example.com');
    const res = await invite(address);
    assert.equal(res.status, 201, 'the invitation was created; the reply has to say so');

    const body = (await res.json()) as { token?: string; undelivered?: boolean };
    assert.ok(body.token, 'nothing delivered it, so the caller needs the token');
    assert.equal(body.undelivered, true, 'the caller has to know the mail did not go out');
  });

  test('a second invitation to the same address is still refused', async () => {
    // The 409 has to keep working for the reason it exists, now that it no longer fires for
    // reasons it does not.
    const address = unique('twice@example.com');
    assert.equal((await invite(address)).status, 201);
    const again = await invite(address);
    assert.equal(again.status, 409);
    assert.equal(((await again.json()) as { error: string }).error, 'already-invited');
  });
});
