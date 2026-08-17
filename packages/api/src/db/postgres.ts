/**
 * The Postgres implementation of Driver.
 *
 * This is the one that proves the abstraction. SQLite and D1 share a dialect, so having both
 * demonstrated very little — a `Driver` interface that only ever spoke SQLite could have been
 * wrong in a dozen ways nobody would have noticed. Postgres is a genuinely different database
 * with a different wire protocol, different placeholders and different integer types, and the
 * same repo.ts runs against it unchanged. That is the claim; `npm run test:api:postgres` is
 * the evidence, running the identical API suite against real Postgres.
 *
 * No import of `pg`, exactly as d1.ts imports nothing from Cloudflare. The surface used here is
 * one method, so it is described locally and you bring your own client — which keeps a fresh
 * clone free of a database dependency it does not need, and keeps this file compiling under a
 * plain typecheck.
 *
 *   import { Pool, types } from 'pg';
 *   import { postgresDriver } from './db/postgres.ts';
 *   import { setDriver } from './db/index.ts';
 *
 *   // int8 arrives as a string otherwise — see the note on timestamps below.
 *   types.setTypeParser(types.builtins.INT8, (v) => Number(v));
 *   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 *   setDriver(postgresDriver(pool));
 */

import type { Driver } from './index.ts';

/** The part of a Postgres client this uses. `pg`'s Pool and Client both satisfy it. */
export interface PgLike {
  query<T>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null; affectedRows?: number }>;
  /**
   * Several statements at once, for migrations. Optional because `pg` accepts them through
   * query() when there are no parameters, while an embedded client generally wants its own
   * entry point for the simple query protocol.
   */
  exec?(sql: string): Promise<unknown>;
}

/**
 * Rewrites `?` placeholders as `$1, $2, …`.
 *
 * repo.ts is written once, in the dialect the other two drivers speak. Translating here rather
 * than parameterising every query twice is what keeps a single copy of the SQL — and the
 * translation is the whole of the syntactic difference between these dialects for the
 * statements this app issues.
 *
 * Question marks inside string literals are skipped: `WHERE name = 'why?'` must not become
 * `'why$1'`. Dollar-quoted bodies and comments are not handled, because nothing here writes
 * them — a query that needs one should use `$n` itself and pass through untouched.
 */
export function toNumberedPlaceholders(sql: string): string {
  let out = '';
  let n = 0;
  let quote: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i] as string;
    if (quote) {
      out += ch;
      // '' inside a single-quoted string is an escaped quote, not the end of it.
      if (ch === quote && sql[i + 1] === quote) {
        out += sql[++i] as string;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    out += ch === '?' ? `$${++n}` : ch;
  }
  return out;
}

export function postgresDriver(db: PgLike): Driver {
  /**
   * How many rows a write touched.
   *
   * `pg` reports rowCount; PGlite — the embedded Postgres the tests run against — reports
   * affectedRows. Both are read rather than one being insisted upon, because the interface
   * this file implements promises a number and callers act on it: `destroySessionByHandle`
   * returns false when it is zero, and returning the wrong thing there would silently answer
   * "no such session" to a valid revocation.
   */
  const changed = (result: { rowCount?: number | null; affectedRows?: number }): number =>
    result.rowCount ?? result.affectedRows ?? 0;

  return {
    async all<T>(sql: string, params: unknown[]): Promise<T[]> {
      const { rows } = await db.query<T>(toNumberedPlaceholders(sql), params);
      return rows;
    },
    async one<T>(sql: string, params: unknown[]): Promise<T | null> {
      const { rows } = await db.query<T>(toNumberedPlaceholders(sql), params);
      return rows[0] ?? null;
    },
    async run(sql: string, params: unknown[]): Promise<number> {
      return changed(await db.query(toNumberedPlaceholders(sql), params));
    },
    async exec(sql: string): Promise<void> {
      // No parameters, so no translation: this is migration DDL, which arrives as several
      // statements at once and carries no placeholders.
      if (db.exec) await db.exec(sql);
      else await db.query(sql);
    },
  };
}
