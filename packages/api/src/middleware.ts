/**
 * The two checks every tenant route needs, in one place.
 *
 * `requireUser` answers "who is this", `requireOrg` answers "may they act in this
 * organisation, in this way". Splitting them matters: a route that only calls the first is
 * authenticated but not authorised, and that is the shape most multi-tenant leaks take.
 */

import { hasRole, type Role } from '@hamscaler/shared';
import type { NextFunction, Request, Response } from 'express';
import { readSession, renewSession, SESSION_COOKIE } from './auth.ts';
import { setSessionCookie } from './cookies.ts';
import { roleIn } from './repo.ts';

/**
 * A single route parameter, or undefined.
 *
 * Express 5 types params as `string | string[]` because a pattern can repeat one. None of
 * ours do, so this narrows in one place instead of a cast at every use.
 */
export function param(req: Request, name: string): string | undefined {
  const value = req.params[name];
  return typeof value === 'string' ? value : undefined;
}

export interface AuthedRequest extends Request {
  userId?: string;
  /** The organisation from the URL, once membership has been confirmed. */
  orgId?: string;
  role?: Role;
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const id = req.cookies?.[SESSION_COOKIE];
  if (!id) {
    res.status(401).json({ error: 'not-signed-in' });
    return;
  }
  const session = readSession(id);
  if (!session) {
    res.status(401).json({ error: 'not-signed-in' });
    return;
  }
  // Renewed here rather than on a schedule, so an active session never lapses and an idle one
  // still expires on time.
  const renewed = renewSession(session);
  if (renewed) setSessionCookie(res, session.id, renewed);
  (req as AuthedRequest).userId = session.user_id;
  next();
}

/**
 * Confirms the caller is a member of the organisation in the URL, at `required` or above.
 *
 * A non-member gets 404, not 403: 403 confirms the organisation exists, which is a membership
 * oracle for anyone willing to enumerate ids.
 */
export function requireOrg(required: Role = 'member') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authed = req as AuthedRequest;
    const orgId = param(req, 'orgId');
    if (!authed.userId || !orgId) {
      res.status(401).json({ error: 'not-signed-in' });
      return;
    }
    const role = roleIn(orgId, authed.userId);
    if (!role) {
      res.status(404).json({ error: 'not-found' });
      return;
    }
    if (!hasRole(role, required)) {
      res.status(403).json({ error: 'insufficient-role' });
      return;
    }
    authed.orgId = orgId;
    authed.role = role;
    next();
  };
}
