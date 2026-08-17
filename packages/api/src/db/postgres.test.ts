import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { postgresDriver, toNumberedPlaceholders } from './postgres.ts';

/**
 * The placeholder rewrite, which is the only logic in the Postgres driver and the only part of
 * it that can be wrong quietly.
 *
 * Everything else in that file is a pass-through the integration suite exercises end to end.
 * This is here because an off-by-one in the numbering, or a question mark taken out of a string
 * literal, produces a query that still runs and returns the wrong rows.
 */

describe('rewriting ? as $n', () => {
  test('numbers placeholders from one, in order', () => {
    assert.equal(
      toNumberedPlaceholders('SELECT * FROM users WHERE id = ? AND email_key = ?'),
      'SELECT * FROM users WHERE id = $1 AND email_key = $2',
    );
  });

  test('leaves a query with no placeholders alone', () => {
    assert.equal(
      toNumberedPlaceholders('SELECT name FROM migrations'),
      'SELECT name FROM migrations',
    );
  });

  test('does not touch a question mark inside a string literal', () => {
    // 'why?' is data. Rewriting it produces a query that runs, binds one parameter too many,
    // and compares against a string nobody wrote.
    assert.equal(
      toNumberedPlaceholders("SELECT * FROM projects WHERE org_id = ? AND name = 'why?'"),
      "SELECT * FROM projects WHERE org_id = $1 AND name = 'why?'",
    );
  });

  test('handles an escaped quote inside a literal', () => {
    assert.equal(
      toNumberedPlaceholders("UPDATE projects SET notes = 'it''s fine?' WHERE id = ?"),
      "UPDATE projects SET notes = 'it''s fine?' WHERE id = $1",
    );
  });

  test('numbers the placeholders of a real upsert correctly', () => {
    // The write-limit upsert names the same values twice, which is where an off-by-one would
    // show up as a rate limit that resets itself.
    const sql = `INSERT INTO write_rate (session_id, window_start, writes) VALUES (?, ?, 1)
       ON CONFLICT(session_id) DO UPDATE SET window_start = ?, writes = 1`;
    const out = toNumberedPlaceholders(sql);
    assert.match(out, /VALUES \(\$1, \$2, 1\)/);
    assert.match(out, /SET window_start = \$3/);
  });
});

describe('the driver', () => {
  const fake = (result: Record<string, unknown>) => {
    const seen: { sql: string; params?: unknown[] }[] = [];
    const db = {
      async query(sql: string, params?: unknown[]) {
        seen.push({ sql, params });
        return result as never;
      },
    };
    return { db, seen };
  };

  test('reports rows changed from rowCount or affectedRows', async () => {
    // pg says rowCount; PGlite says affectedRows. Reading only one of them returns 0 for every
    // write on the other, and callers treat 0 as "nothing matched".
    const pg = fake({ rows: [], rowCount: 3 });
    assert.equal(await postgresDriver(pg.db).run('DELETE FROM sessions WHERE id = ?', ['x']), 3);

    const pglite = fake({ rows: [], affectedRows: 2 });
    assert.equal(
      await postgresDriver(pglite.db).run('DELETE FROM sessions WHERE id = ?', ['x']),
      2,
    );

    const neither = fake({ rows: [] });
    assert.equal(await postgresDriver(neither.db).run('DELETE FROM sessions', []), 0);
  });

  test('one() returns null rather than undefined when nothing matched', async () => {
    // Callers compare against null, and `undefined` slips through a `!== null` check.
    const { db } = fake({ rows: [] });
    assert.equal(await postgresDriver(db).one('SELECT 1 WHERE false', []), null);
  });

  test('exec passes DDL through without translation', async () => {
    const { db, seen } = fake({ rows: [] });
    await postgresDriver(db).exec("CREATE TABLE t (a TEXT DEFAULT 'huh?')");
    assert.equal(seen[0]?.sql, "CREATE TABLE t (a TEXT DEFAULT 'huh?')");
  });
});
