/**
 * The D1 implementation of Driver.
 *
 * D1 is SQLite over Cloudflare's network, so every statement in repo.ts runs unchanged — the
 * dialect is the same one. What differs is that it is asynchronous and that the database
 * arrives as a binding on the request environment rather than as a connection string, which is
 * why this is a factory rather than a module that connects itself.
 *
 * No import from `cloudflare:workers` and no generated types: the surface used here is four
 * methods, so it is described locally and this file stays compilable under a plain Node
 * typecheck. A wrong guess about that surface fails at the first request, not silently.
 */

import type { Driver } from './index.ts';

/** The part of D1's API this uses. */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
  exec(sql: string): Promise<unknown>;
}

export function d1Driver(database: D1Like): Driver {
  return {
    async all<T>(sql: string, params: unknown[]): Promise<T[]> {
      const { results } = await database
        .prepare(sql)
        .bind(...params)
        .all<T>();
      return results;
    },
    async one<T>(sql: string, params: unknown[]): Promise<T | null> {
      return await database
        .prepare(sql)
        .bind(...params)
        .first<T>();
    },
    async run(sql: string, params: unknown[]): Promise<number> {
      const { meta } = await database
        .prepare(sql)
        .bind(...params)
        .run();
      return meta.changes;
    },
    async exec(sql: string): Promise<void> {
      // Migrations are applied by `wrangler d1 migrations apply`, not at runtime — a Worker has
      // no filesystem to read .sql files from, and running them on every cold start would have
      // every isolate racing the same DDL. This exists so the interface is honest, and for the
      // seed script, which is run deliberately.
      await database.exec(sql);
    },
  };
}
