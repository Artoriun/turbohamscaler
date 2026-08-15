/**
 * Session cookie handling.
 *
 * `SameSite=Lax` rather than `None`: the app and API are same-site in every deployment this
 * starter documents, and Lax is what makes the session immune to cross-site request forgery
 * without a token dance. If you split them across domains you need `None; Secure` *and* CSRF
 * tokens — a trade worth making deliberately, not by accident.
 */

import type { Response } from 'express';
import { SESSION_COOKIE } from './auth.ts';

const isProd = () => process.env.NODE_ENV === 'production';

export function setSessionCookie(res: Response, id: string, expiresAt: number): void {
  res.cookie(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure would make the cookie invisible over plain http, which is how everyone runs the
    // dev server. Production is https, and there it is required.
    secure: isProd(),
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd(), path: '/' });
}
