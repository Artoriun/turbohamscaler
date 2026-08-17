/**
 * Cloudflare Workers entry point.
 *
 * The sibling of index.ts, and deliberately as small as it is: the routes, the tenancy rules
 * and the auth are the same objects both files import. What differs is what listens, and where
 * the database comes from.
 *
 * There is no migration step here on purpose. A Worker has no filesystem to read .sql files
 * from, and running DDL on every cold start would have every isolate racing the same
 * statements. D1 applies migrations from the command line instead:
 *
 *     npx wrangler d1 migrations apply hamscaler --remote
 *
 * which is a deploy step rather than a runtime one — see wrangler.toml.
 */

import { createApp } from './app.ts';
import { sweepExpired } from './auth.ts';
import { type D1Like, d1Driver } from './db/d1.ts';
import { setDriver } from './db/index.ts';

export interface Env {
  /** Bound in wrangler.toml. The name here must match the binding there. */
  DB: D1Like;
}

const app = createApp();

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    // D1 arrives per request rather than as a connection string, so the driver is installed
    // here. Cheap and idempotent: it replaces a reference, and every isolate does it once per
    // request against the same binding.
    setDriver(d1Driver(env.DB));
    return app.fetch(request, env, ctx as never);
  },

  /**
   * The expiry sweep, on the schedule in wrangler.toml.
   *
   * index.ts does this at start-up, which suits a process that restarts. A Worker has no
   * start-up to hang it on — an isolate is created and discarded around single requests — so
   * without this the Workers deployment was the one where expired sessions and stale sign-in
   * attempts accumulated forever. Same function, different trigger.
   */
  async scheduled(_event: unknown, env: Env, _ctx: unknown): Promise<void> {
    setDriver(d1Driver(env.DB));
    const swept = await sweepExpired();
    console.log(`swept ${swept.sessions} session(s), ${swept.attempts} sign-in attempt(s)`);
  },
};
