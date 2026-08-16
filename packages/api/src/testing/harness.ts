/**
 * A running API against an empty in-memory database, plus helpers to create signed-in users.
 *
 * Every suite gets its own database and its own port, so tests neither share state nor need to
 * be ordered.
 */

import type { Server } from 'node:http';
import type { Express } from 'express';
import { createApp } from '../app.ts';
import { closeDb } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';

export interface Harness {
  base: string;
  close: () => Promise<void>;
}

export async function startApi(): Promise<Harness> {
  process.env.DATABASE_URL = ':memory:';
  closeDb();
  migrate(() => {});
  const app: Express = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;
  return {
    base: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => {
          closeDb();
          resolve();
        });
      }),
  };
}

export interface Actor {
  cookie: string;
  userId: string;
  email: string;
  orgId: string;
}

/** Signs a new user up, which also creates the organisation they own. */
export async function signUp(
  base: string,
  email: string,
  password = 'correct-horse-battery',
): Promise<Actor> {
  const res = await fetch(`${base}/api/auth/sign-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: email.split('@')[0], password }),
  });
  if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    user: { id: string };
    organisations: { id: string }[];
  };
  const setCookie = res.headers.get('set-cookie') ?? '';
  return {
    cookie: setCookie.split(';')[0] as string,
    userId: body.user.id,
    email,
    orgId: body.organisations[0]?.id as string,
  };
}

/**
 * Puts `guest` into `host`'s organisation, the only way in: `host` issues an invitation and
 * `guest` accepts it.
 *
 * Two calls rather than one because that is the real flow — a test that reached into the
 * database to add the membership would pass while the flow itself was broken.
 */
export async function invite(
  base: string,
  host: Actor,
  guest: Actor,
  role: 'member' | 'admin' = 'member',
): Promise<void> {
  const made = await as(host)(`${base}/api/orgs/${host.orgId}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ email: guest.email, role }),
  });
  if (made.status !== 201) throw new Error(`invite failed: ${made.status} ${await made.text()}`);
  const { token } = (await made.json()) as { token: string };

  const accepted = await as(guest)(`${base}/api/invitations/${token}/accept`, { method: 'POST' });
  if (accepted.status !== 201) {
    throw new Error(`accept failed: ${accepted.status} ${await accepted.text()}`);
  }
}

/** A fetch carrying an actor's session cookie, or none for an anonymous caller. */
export function as(actor: Actor | null) {
  return (url: string, init: RequestInit = {}) =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(actor ? { cookie: actor.cookie } : {}),
        ...init.headers,
      },
    });
}
