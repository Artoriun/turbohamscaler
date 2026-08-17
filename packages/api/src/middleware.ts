/**
 * The two checks every tenant route needs, in one place.
 *
 * `requireUser` answers "who is this", `requireOrg` answers "may they act in this
 * organisation, in this way". Splitting them matters: a route that only calls the first is
 * authenticated but not authorised, and that is the shape most multi-tenant leaks take.
 *
 * Written for Hono rather than Express so the same handlers serve Node and a Workers-style
 * runtime. Hono is built on the Request and Response of the Web platform, which is what both
 * have in common; Express needs node:http, which one of them does not have.
 */

import { hasRole, type Role } from '@hamscaler/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { readSession, renewSession } from './auth.ts';
import { readSessionCookie, setSessionCookie } from './cookies.ts';
import { roleIn } from './repo.ts';
import { recordWrite } from './writeLimit.ts';

/**
 * What the checks below hang on the request for the handlers to read.
 *
 * Typed as Hono `Variables` rather than by widening the request object, which is what the
 * Express version did — `c.get('userId')` is checked, where a property bolted onto a request
 * was only ever a cast.
 */
export interface AuthVariables {
  Variables: {
    userId: string;
    /** The organisation from the URL, once membership has been confirmed. */
    orgId: string;
    role: Role;
  };
}

export type AppContext = Context<AuthVariables>;

/** Methods that only read. Everything else counts against the session's write allowance. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Writes that end a session, which the allowance must never stand in the way of.
 *
 * A throttled session could not sign out: sign-out is a POST, every POST was charged, and a
 * client that had spent its minute got a 429 from the one control that stops it spending
 * anything more. `sign-out-everywhere` was caught by the same rule, which is worse — that is
 * the route you reach for when a session has been stolen, and it was unreachable for the
 * exact minute the theft was busiest.
 *
 * Exempting them costs nothing the limit was protecting. Each one deletes rows rather than
 * adding them, and the session doing it stops existing, so it cannot be used to get around the
 * allowance: spend it, sign out, and the allowance is gone with the session.
 */
const ALWAYS_ALLOWED = new Set([
  '/api/auth/sign-out',
  '/api/auth/sign-out-everywhere',
  '/api/me/sessions/:handle/revoke',
]);

/** A single route parameter, or undefined when it is absent or empty. */
export function param(c: AppContext, name: string): string | undefined {
  const value = c.req.param(name);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export const requireUser: MiddlewareHandler<AuthVariables> = async (c, next) => {
  const id = readSessionCookie(c);
  if (!id) return c.json({ error: 'not-signed-in' }, 401);

  const session = await readSession(id);
  if (!session) return c.json({ error: 'not-signed-in' }, 401);

  // Renewed here rather than on a schedule, so an active session never lapses and an idle one
  // still expires on time.
  const renewed = await renewSession(session);
  if (renewed) setSessionCookie(c, session.id, renewed);

  // Throttle writes, not reads. A read is cheap and a page can legitimately make several at
  // once; a write is what fills a small database up. Checked here rather than per route so a
  // route added later is covered without anyone remembering to cover it.
  // routePath is the pattern that matched, not the URL, so the exemption is a list of routes
  // rather than a prefix test that a path like /api/auth/sign-out-of-something would satisfy.
  if (!SAFE_METHODS.has(c.req.method) && !ALWAYS_ALLOWED.has(c.req.routePath)) {
    const allowance = await recordWrite(session.id);
    if (!allowance.allowed) {
      return c.json({ error: 'too-many-writes', retryAfterMs: allowance.retryAfterMs }, 429);
    }
  }

  c.set('userId', session.user_id);
  await next();
  return undefined;
};

/**
 * Confirms the caller is a member of the organisation in the URL, at `required` or above.
 *
 * A non-member gets 404, not 403: 403 confirms the organisation exists, which is a membership
 * oracle for anyone willing to enumerate ids.
 */
export function requireOrg(required: Role = 'member'): MiddlewareHandler<AuthVariables> {
  return async (c, next) => {
    const userId = c.get('userId');
    const orgId = param(c, 'orgId');
    if (!userId || !orgId) return c.json({ error: 'not-signed-in' }, 401);

    const role = await roleIn(orgId, userId);
    if (!role) return c.json({ error: 'not-found' }, 404);
    if (!hasRole(role, required)) return c.json({ error: 'insufficient-role' }, 403);

    c.set('orgId', orgId);
    c.set('role', role);
    await next();
    return undefined;
  };
}
