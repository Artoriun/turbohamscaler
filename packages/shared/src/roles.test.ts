import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hasRole, ROLES, rank } from './index.ts';

/**
 * The role comparison is the authorisation model — `requireOrg` is a thin wrapper over it — so
 * a mistake here is an access-control bug rather than a display one.
 */

describe('rank', () => {
  test('orders roles least to most privileged', () => {
    assert.deepEqual([...ROLES], ['member', 'admin', 'owner']);
    assert.ok(rank('owner') > rank('admin'));
    assert.ok(rank('admin') > rank('member'));
  });

  test('an unrecognised role ranks below everything', () => {
    // -1 rather than 0: a typo in a role name must fail closed, not silently grant the lowest
    // real role's privileges.
    assert.equal(rank('superuser'), -1);
    assert.equal(rank(''), -1);
  });
});

describe('hasRole', () => {
  test('a role satisfies itself and everything below it', () => {
    assert.ok(hasRole('owner', 'member'));
    assert.ok(hasRole('owner', 'owner'));
    assert.ok(hasRole('admin', 'member'));
    assert.ok(hasRole('member', 'member'));
  });

  test('a role does not satisfy anything above it', () => {
    assert.equal(hasRole('member', 'admin'), false);
    assert.equal(hasRole('admin', 'owner'), false);
  });

  test('an unrecognised role satisfies nothing', () => {
    for (const required of ROLES) {
      assert.equal(hasRole('nonsense', required), false, `nonsense must not satisfy ${required}`);
    }
  });
});
