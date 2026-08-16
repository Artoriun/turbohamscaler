/**
 * Session cookie handling.
 *
 * `SameSite=Lax` rather than `None`: the app and API are same-site in every deployment this
 * starter documents, and Lax is what makes the session immune to cross-site request forgery
 * without a token dance. If you split them across domains you need `None; Secure` *and* CSRF
 * tokens — a trade worth making deliberately, not by accident.
 */

import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { SESSION_COOKIE } from './auth.ts';

/**
 * Whether to mark the cookie Secure.
 *
 * `globalThis.process?.env` rather than `process.env`: a Workers-style runtime has no process
 * global, and reading it unguarded throws at the first request rather than at start-up, which
 * is the worst time to find out. Anywhere without one is https by definition, so Secure is the
 * right default there.
 */
const isProd = () => globalThis.process?.env?.NODE_ENV !== 'development';

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

export function setSessionCookie(c: Context, id: string, expiresAt: number): void {
  setCookie(c, SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'Lax',
    // Secure would make the cookie invisible over plain http, which is how everyone runs the
    // dev server. Production is https, and there it is required.
    secure: isProd(),
    expires: new Date(expiresAt),
    path: '/',
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { httpOnly: true, sameSite: 'Lax', secure: isProd(), path: '/' });
}
