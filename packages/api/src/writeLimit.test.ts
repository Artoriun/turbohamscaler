import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { LIMITS } from '@hamscaler/shared';
import { type Actor, as, type Harness, signUp, startApi } from './testing/harness.ts';

/**
 * The per-session write limit.
 *
 * `LIMITS.writesPerMinute` was declared from the first commit and read by nothing — a constant
 * describing protection that did not exist. These tests are the difference between the comment
 * being true and being decoration.
 */

let api: Harness;
let actor: Actor;

before(async () => {
  api = await startApi();
  actor = await signUp(api.base, 'writer@example.com');
});

after(async () => {
  await api.close();
});

const addProject = (who: Actor) =>
  as(who)(`${api.base}/api/orgs/${who.orgId}/projects`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Another one' }),
  });

describe('writing too fast', () => {
  test('is refused once the allowance is spent, with something to wait on', async () => {
    // Sequential rather than in parallel: the counter is a read-then-write, and firing them all
    // at once would be measuring how the database interleaves rather than the rule.
    let refused: Response | null = null;
    for (let i = 0; i < LIMITS.writesPerMinute + 5; i++) {
      const res = await addProject(actor);
      if (res.status === 429) {
        refused = res;
        break;
      }
      assert.equal(res.status, 201, `write ${i + 1} should have been allowed`);
    }

    assert.ok(refused, `${LIMITS.writesPerMinute + 5} writes should not all have been allowed`);
    const body = (await (refused as Response).json()) as { error: string; retryAfterMs: number };
    assert.equal(body.error, 'too-many-writes');
    assert.ok(
      body.retryAfterMs > 0 && body.retryAfterMs <= 60_000,
      `a client needs to know how long to wait; got ${body.retryAfterMs}`,
    );
  });

  test('reading is still allowed while writing is throttled', async () => {
    // The limit exists to protect a small database from a runaway client, not to sign anybody
    // out. A throttled session that could not read either would look broken.
    const res = await as(actor)(`${api.base}/api/orgs/${actor.orgId}/projects`);
    assert.equal(res.status, 200);
  });

  test('another session has its own allowance', async () => {
    // Keyed on the session, so one bad client does not throttle everybody else — including the
    // same person on a different device.
    const other = await signUp(api.base, 'other-writer@example.com');
    assert.equal((await addProject(other)).status, 201);
  });
});
