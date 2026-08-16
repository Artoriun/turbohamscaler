/**
 * A running API against an empty in-memory database, plus helpers to create signed-in users.
 *
 * Every suite gets its own database and its own port, so tests neither share state nor need to
 * be ordered.
 */

import { type ServerType, serve } from '@hono/node-server';
import { createApp } from '../app.ts';
import { closeDb } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';

export interface Harness {
  base: string;
  close: () => Promise<void>;
}

export async function startApi(): Promise<Harness> {
  // Point the suite at an API that is already running, instead of starting one here. That is
  // how the same tests are run against the Worker (`npm run test:api:worker`): the assertions
  // are about the API's behaviour, and behaviour is exactly what should not depend on which
  // runtime is serving it.
  const external = process.env.API_BASE;
  if (external) {
    return { base: external.replace(/\/$/, ''), close: async () => {} };
  }

  process.env.DATABASE_URL = ':memory:';
  closeDb();
  await migrate(() => {});
  // The same app object the deployed Worker exports; only the thing listening differs.
  const server = (await new Promise((resolve) => {
    const s = serve({ fetch: createApp().fetch, port: 0 }, () => resolve(s));
  })) as ServerType;
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
/**
 * Makes an address unique to this run.
 *
 * The suites used to rely on starting against an empty in-memory database, so fixed addresses
 * were safe. Running them against a Worker's D1 breaks that assumption — the database outlives
 * the process — and a second run would collide on every sign-up. Uniquifying here rather than
 * in each test keeps the tests readable and makes them independent of what is already stored.
 */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const unique = (address: string) => address.replace('@', `+${RUN}@`);

export async function signUp(
  base: string,
  address: string,
  password = 'correct-horse-battery',
): Promise<Actor> {
  const email = unique(address);
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
