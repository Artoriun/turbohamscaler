/**
 * The database handle, behind an interface with two implementations.
 *
 * `node:sqlite` ships with Node 22, so a fresh clone needs no native build and no account:
 * `npm install && npm run dev` has a working database.
 *
 * The helpers below are **async**, and that is the whole point of this file. node:sqlite is
 * synchronous and D1 is not, so sync helpers pinned the entire API to Node no matter how the
 * driver was imported — every caller would have had to change to move hosts. Awaiting a
 * synchronous driver costs a microtask and buys the ability to swap in D1 (see d1.ts) without
 * touching repo.ts, the routes, or anything above them.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** What the rest of the API needs from a database. Implemented here and in d1.ts. */
export interface Driver {
  all<T>(sql: string, params: unknown[]): Promise<T[]>;
  one<T>(sql: string, params: unknown[]): Promise<T | null>;
  run(sql: string, params: unknown[]): Promise<number>;
  /** Multiple statements at once, for migrations. */
  exec(sql: string): Promise<void>;
}

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

function sqlite(): DatabaseSync {
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

/** The bundled driver: Node's own SQLite, wrapped to satisfy the async interface. */
export const nodeSqliteDriver: Driver = {
  async all<T>(sql: string, params: unknown[]): Promise<T[]> {
    return sqlite()
      .prepare(sql)
      .all(...(params as never[])) as T[];
  },
  async one<T>(sql: string, params: unknown[]): Promise<T | null> {
    const row = sqlite()
      .prepare(sql)
      .get(...(params as never[]));
    return (row ?? null) as T | null;
  },
  async run(sql: string, params: unknown[]): Promise<number> {
    return Number(
      sqlite()
        .prepare(sql)
        .run(...(params as never[])).changes,
    );
  },
  async exec(sql: string): Promise<void> {
    sqlite().exec(sql);
  },
};

let driver: Driver = nodeSqliteDriver;

/**
 * Swaps the driver. Called once at startup by a host that brings its own database.
 *
 * D1 arrives per-request as a binding on the environment rather than as a connection string,
 * which is why this is a setter rather than something databaseUrl() could decide.
 */
export function setDriver(next: Driver): void {
  driver = next;
}

/** Drops the cached handle. Tests use this between suites; nothing in the app does. */
export function closeDb(): void {
  handle?.close();
  handle = null;
}

/** All rows, typed by the caller. */
export function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  return driver.all<T>(sql, params);
}

/** The first row, or null. */
export function one<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  return driver.one<T>(sql, params);
}

/** A write. Resolves to the number of rows changed. */
export function run(sql: string, ...params: unknown[]): Promise<number> {
  return driver.run(sql, params);
}

/** Several statements at once. Migrations only. */
export function exec(sql: string): Promise<void> {
  return driver.exec(sql);
}
