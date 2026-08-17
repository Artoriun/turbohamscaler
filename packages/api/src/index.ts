/**
 * Node entry point. Runs migrations before listening, so a fresh clone or a new deploy is
 * never serving against a schema that does not exist yet.
 *
 * This file is the Node half of the app and nothing else: the routes in app.ts are a Hono app
 * built on the Request and Response of the Web platform, so the same object is exported for a
 * Workers-style runtime by worker.ts. Only the thing that listens differs.
 *
 * It will also serve the built front end when one is present, which is what makes a single
 * free instance a working deployment rather than half of one. The session cookie is
 * SameSite=Lax, so a front end on a different *site* never sends it — two hosts means the app
 * cannot sign anybody in no matter how the URLs are configured. One origin serving both is the
 * arrangement that works, and it is the cheapest as well as the simplest.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { sweepExpired } from './auth.ts';
import { migrate } from './db/migrate.ts';
import { seed } from './db/seed.ts';

/**
 * PORT first: every managed host injects it and expects the process to bind exactly that,
 * failing the health check otherwise. API_PORT stays the local knob, so `npm run dev` and the
 * test harness keep choosing their own.
 */
const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 4410);

const HERE = dirname(fileURLToPath(import.meta.url));
/** Both the source layout and the compiled one, since dist/ sits a level deeper. */
const WEB_DIST = [join(HERE, '../../web/dist'), join(HERE, '../../../web/dist')].find((p) =>
  existsSync(join(p, 'index.html')),
);

await migrate();

// Expired sessions and stale sign-in attempts, cleared on the way up. See sweepExpired.
const swept = await sweepExpired();
if (swept.sessions || swept.attempts) {
  console.log(`  swept ${swept.sessions} expired session(s), ${swept.attempts} sign-in attempt(s)`);
}

/**
 * Seeds an empty database when asked.
 *
 * For a demo instance on a host with no persistent disk, where every restart starts from
 * nothing: without this the first visitor meets an empty database and a sign-in form, which is
 * a worse advertisement than the screenshots. Off unless DEMO_SEED is set, because creating
 * accounts nobody asked for is not a thing to do to somebody's real deployment.
 */
if (process.env.DEMO_SEED === 'true') await seed();

const app = createApp();

if (WEB_DIST) {
  const dist = WEB_DIST;

  /**
   * A content security policy, with the theme script allowed by its hash rather than by
   * `unsafe-inline`.
   *
   * index.html runs one inline script before first paint, so that an explicit dark-mode choice
   * never flashes the wrong theme. That single script is the only reason a policy here would
   * otherwise need `unsafe-inline` — which allows every inline script, including one an
   * injection put there, and is most of what a policy is for. Hashing what is actually in the
   * file keeps the policy strict and keeps it correct when the script changes: it is read from
   * the build rather than pinned in a constant that would quietly stop matching.
   *
   * `img-src data:` because the reduced-motion stills are inlined by the bundler when small
   * enough. No `connect-src` beyond self: the app talks to its own origin and nothing else,
   * which is the same reason the session cookie can be SameSite=Lax.
   */
  const shell = await readFile(join(dist, 'index.html'), 'utf8');
  const inlineHashes = [...shell.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
  );
  const CSP = [
    "default-src 'self'",
    `script-src 'self' ${inlineHashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  app.use('/*', async (c, next) => {
    await next();
    // Documents only. Sending it with a stylesheet or a font costs bytes on every asset and
    // governs nothing — the policy applies to the page that loaded them.
    if ((c.res.headers.get('content-type') ?? '').includes('text/html')) {
      c.res.headers.set('content-security-policy', CSP);
    }
  });

  /**
   * How long each kind of file may be reused.
   *
   * Vite puts a hash of the contents into the name of everything under /assets, which is the
   * whole reason those names are ugly: the file at a given name can never change, so it never
   * needs revalidating. Without a header saying so, the server sent only Last-Modified and
   * every visitor asked about every asset on every page load — paying a round trip each time
   * to be told nothing had changed.
   *
   * The HTML is the opposite. It is the one file whose name stays put, so it has to be checked
   * every time or a deploy never reaches anybody: no-cache means revalidate, not "do not
   * store", so it still costs a 304 rather than a download.
   */
  app.use('/*', async (c, next) => {
    await next();
    if (c.res.headers.has('cache-control')) return;
    const path = c.req.path;
    if (path.startsWith('/api')) return;
    // Vite's shape is name-HASH.ext, so the hash is what follows the last hyphen — not a
    // dot-separated segment, which is what this looked for at first and never matched.
    if (/^\/assets\/.+-[0-9a-zA-Z_-]{8,}\.[a-z0-9]+$/.test(path)) {
      c.res.headers.set('cache-control', 'public, max-age=31536000, immutable');
    } else if (/\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?)$/.test(path)) {
      // Named by hand rather than by hash — a favicon or a touch icon — so it can change under
      // the same name. A day is long enough to be worth having and short enough to fix.
      c.res.headers.set('cache-control', 'public, max-age=86400');
    } else {
      c.res.headers.set('cache-control', 'no-cache');
    }
  });

  // Anything the API did not answer falls through to the built files.
  app.use('/*', serveStatic({ root: dist }));

  app.notFound(async (c) => {
    // An unknown /api path is an API error, not a page. Serving HTML there would hand a client
    // expecting JSON a document, and the failure would surface as a parse error somewhere else.
    if (c.req.path.startsWith('/api')) return c.json({ error: 'not-found' }, 404);

    // Otherwise the single-page app answers, and the status depends on whether this build was
    // prerendered.
    //
    // A prerendered build has a real file for every route it knows, so anything still unmatched
    // really is unknown and deserves a 404 — that status is the only thing telling a crawler the
    // page is not real. A plain `npm run build` has one file for the whole app, so the server
    // cannot tell /app from /aqq and answering 404 would mark every genuine route as missing.
    // Presence of 404.html is what distinguishes them, because only the prerenderer writes it.
    const prerendered = existsSync(join(dist, '404.html'));
    const html = await readFile(join(dist, prerendered ? '404.html' : 'index.html'), 'utf8');
    return c.html(html, prerendered ? 404 : 200);
  });
}

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`✓ api on http://localhost:${PORT}`);
  console.log(WEB_DIST ? `  serving the built front end from ${WEB_DIST}` : '  no built front end');
});
