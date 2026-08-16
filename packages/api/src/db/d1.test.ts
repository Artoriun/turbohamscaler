import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { d1Driver } from './d1.ts';

/**
 * The D1 driver, against a stand-in for D1 itself.
 *
 * There is no D1 to talk to in a Node test run, and the point here is not to test Cloudflare's
 * database — it is to check that this adapter calls it the way its API expects and unwraps the
 * three differently-shaped replies correctly. Those are exactly the mistakes that would
 * otherwise only surface on a deployed Worker, which is the slowest place to find them.
 */

function fakeD1(replies: { all?: unknown[]; first?: unknown; changes?: number }): {
  db: Parameters<typeof d1Driver>[0];
  calls: { sql: string; params: unknown[] }[];
} {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          calls.push({ sql, params });
          return {
            async all<T>() {
              return { results: (replies.all ?? []) as T[] };
            },
            async first<T>() {
              return (replies.first ?? null) as T | null;
            },
            async run() {
              return { meta: { changes: replies.changes ?? 0 } };
            },
          };
        },
      };
    },
    async exec() {
      calls.push({ sql: 'exec', params: [] });
      return undefined;
    },
  };
  return { db, calls };
}

describe('the D1 driver', () => {
  test('all() unwraps the results array', async () => {
    const { db, calls } = fakeD1({ all: [{ id: 'a' }, { id: 'b' }] });
    const rows = await d1Driver(db).all<{ id: string }>('SELECT * FROM projects WHERE org_id = ?', [
      'org-1',
    ]);
    assert.deepEqual(rows, [{ id: 'a' }, { id: 'b' }]);
    // D1 returns { results: [...] }; handing that back whole would give every caller an object
    // where it expected an array, and .map would be undefined.
    assert.equal(calls[0]?.sql, 'SELECT * FROM projects WHERE org_id = ?');
    assert.deepEqual(calls[0]?.params, ['org-1']);
  });

  test('one() returns the row or null, never undefined', async () => {
    const found = await d1Driver(fakeD1({ first: { id: 'a' } }).db).one('SELECT 1', []);
    assert.deepEqual(found, { id: 'a' });

    const missing = await d1Driver(fakeD1({}).db).one('SELECT 1', []);
    assert.equal(missing, null, 'callers check for null; undefined would slip past `=== null`');
  });

  test('run() reports the number of rows changed', async () => {
    const changed = await d1Driver(fakeD1({ changes: 3 }).db).run('DELETE FROM projects', []);
    assert.equal(changed, 3);

    // Several routes decide a 404 from this being zero, so the unwrapping has to be exact.
    const none = await d1Driver(fakeD1({ changes: 0 }).db).run('DELETE FROM projects', []);
    assert.equal(none, 0);
  });

  test('parameters are bound, not interpolated', async () => {
    const { db, calls } = fakeD1({ changes: 1 });
    await d1Driver(db).run('INSERT INTO projects (id, org_id) VALUES (?, ?)', ['p-1', "o'brien"]);
    assert.deepEqual(calls[0]?.params, ['p-1', "o'brien"]);
    assert.ok(
      !calls[0]?.sql.includes("o'brien"),
      'the value must reach the database as a bound parameter, not inside the statement',
    );
  });
});
