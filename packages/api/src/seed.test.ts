import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { DEMO_SIGN_IN } from '@hamscaler/shared';
import { closeDb } from './db/index.ts';
import { seed } from './db/seed.ts';
import { verifyPassword } from './password.ts';
import { findUserByEmail, organisationsFor } from './repo.ts';

/**
 * The demo account the public page advertises is the one the seed creates.
 *
 * These lived in two packages with the address written out in both, so renaming the demo
 * hamster left the marketing page telling visitors to sign in as somebody who did not exist.
 * A shared constant fixes the spelling; this fixes the part a constant cannot — that the seed
 * actually creates an account those credentials open.
 *
 * The first attempt at this was a browser test asserting the page contained DEMO_SIGN_IN.email.
 * It passed with the constant changed to nonsense, because the page and the assertion read the
 * same value: it proved the page renders what it is given, which was never in doubt.
 *
 * Node only: it seeds a real database, which under test:api:worker lives in the Worker's D1.
 */

const skip = Boolean(process.env.API_BASE);

before(async () => {
  process.env.DATABASE_URL = ':memory:';
  closeDb();
});

after(() => {
  closeDb();
});

describe('the seeded demo account', { skip }, () => {
  test('exists, opens with the advertised password, and owns an organisation', async () => {
    await seed(() => {});

    const user = await findUserByEmail(DEMO_SIGN_IN.email);
    assert.ok(user, `the seed should create ${DEMO_SIGN_IN.email}`);
    assert.equal(
      await verifyPassword(DEMO_SIGN_IN.password, user.password),
      true,
      'the advertised password should open the advertised account',
    );

    const orgs = await organisationsFor(user.id);
    assert.equal(orgs.length, 1);
    assert.equal(orgs[0]?.role, 'owner', 'the demo account should own something to look at');
  });
});
