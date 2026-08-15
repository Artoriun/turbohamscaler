/**
 * The database handle.
 *
 * `node:sqlite` ships with Node 22, so a fresh clone needs no native build step and no
 * account: `npm install && npm run dev` has a working database. Swapping to D1 or Postgres
 * means replacing this module and the query helpers in repo.ts — nothing above them imports a
 * driver directly, which is the point of routing every read and write through those helpers.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Where the database lives; `:memory:` in tests, so each run starts from a known empty one.
 *
 * Read at connect time rather than at import: a module-level constant is evaluated when the
 * first importer loads it, which is before a test harness gets the chance to point it
 * somewhere else — so the suite silently runs against the developer's real file instead.
 */
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? '.data/hamscaler.db';
}

let handle: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (handle) return handle;
  const url = databaseUrl();
  if (url !== ':memory:') mkdirSync(dirname(url), { recursive: true });
  handle = new DatabaseSync(url);
  // WAL keeps a read from blocking behind a write, which matters as soon as more than one
  // request is in flight. Harmless on :memory:, where it is simply ignored.
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');
  return handle;
}

/** Drops the cached handle. Tests use this between suites; nothing in the app does. */
export function closeDb(): void {
  handle?.close();
  handle = null;
}

/** All rows, typed by the caller. */
export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db()
    .prepare(sql)
    .all(...(params as never[])) as T[];
}

/** The first row, or null. */
export function one<T>(sql: string, ...params: unknown[]): T | null {
  const row = db()
    .prepare(sql)
    .get(...(params as never[]));
  return (row ?? null) as T | null;
}

/** A write. Returns the number of rows changed. */
export function run(sql: string, ...params: unknown[]): number {
  const result = db()
    .prepare(sql)
    .run(...(params as never[]));
  return Number(result.changes);
}
