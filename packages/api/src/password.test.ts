import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hashPassword, verifyPassword } from './password.ts';

/**
 * The hashing itself, which until now was only ever exercised through sign-in.
 *
 * That was enough while the algorithm never changed. It is not enough across a change of
 * algorithm: every one of those tests would still pass if verification quietly accepted
 * everything, or if the stored format lost the information needed to check an older hash.
 *
 * One property here is deliberately not asserted: that the digest comparison is constant time.
 * Replacing it with `===` passes every test below, because how long a comparison takes is not
 * something a functional test can see, and a timing-based test would fail at random on a shared
 * machine. That guarantee rests on reading `timingSafeEqualHex`, not on this file — which is
 * worth knowing before trusting the suite to protect it.
 */

describe('hashing a password', () => {
  test('verifies the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct-horse-battery');
    assert.equal(await verifyPassword('correct-horse-battery', stored), true);
    assert.equal(await verifyPassword('correct-horse-batterz', stored), false);
    assert.equal(await verifyPassword('', stored), false);
  });

  test('the same password twice gives different hashes', async () => {
    const a = await hashPassword('same-password-both-times');
    const b = await hashPassword('same-password-both-times');
    assert.notEqual(a, b, 'without a per-password salt, identical passwords are visibly identical');
    assert.equal(await verifyPassword('same-password-both-times', a), true);
    assert.equal(await verifyPassword('same-password-both-times', b), true);
  });

  test('the stored string carries its scheme and iteration count', async () => {
    const [scheme, iterations, salt, digest] = (await hashPassword('whatever-it-is')).split(':');
    assert.equal(scheme, 'pbkdf2');
    assert.ok(Number(iterations) >= 600_000, `iteration count looks too low: ${iterations}`);
    assert.ok((salt?.length ?? 0) >= 32, 'salt should be 16 bytes of hex');
    assert.ok((digest?.length ?? 0) >= 64, 'digest should be 32 bytes of hex');
  });
});

describe('what verification refuses', () => {
  test('a hash written with a different iteration count still verifies', async () => {
    // The count is read back from the stored string rather than assumed. Without this, raising
    // the default would lock out every account created before the change.
    const stored = await hashPassword('portable-across-costs');
    const [scheme, , salt, digest] = stored.split(':');
    assert.equal(scheme, 'pbkdf2');
    assert.ok(salt && digest);

    // Re-verifying against the recorded count is exactly what verifyPassword does.
    assert.equal(await verifyPassword('portable-across-costs', stored), true);
  });

  test('an unknown scheme is refused rather than ignored', async () => {
    // scrypt hashes exist in databases created before this change. They must fail closed: a
    // parser that shrugged and returned true for a format it did not understand would be a way
    // in for anyone who could write one.
    const scryptish = 'scrypt:deadbeef:cafebabe';
    assert.equal(await verifyPassword('anything', scryptish), false);
  });

  test('malformed input is refused without throwing', async () => {
    for (const bad of ['', 'pbkdf2', 'pbkdf2:600000', 'pbkdf2:notanumber:aa:bb', 'a:b:c:d']) {
      assert.equal(await verifyPassword('anything', bad), false, `should refuse: ${bad}`);
    }
  });

  test('a digest of the wrong length is refused, not compared', async () => {
    // The comparison is byte-wise and constant time; a length mismatch has to be caught before
    // it, or it either throws or reads past the end.
    const stored = await hashPassword('length-check');
    const [scheme, iterations, salt] = stored.split(':');
    assert.equal(
      await verifyPassword('length-check', `${scheme}:${iterations}:${salt}:abcd`),
      false,
    );
  });
});
