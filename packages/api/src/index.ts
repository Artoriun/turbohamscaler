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

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
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
  // Anything the API did not answer falls through to the built files.
  app.use('/*', serveStatic({ root: dist }));

  app.notFound(async (c) => {
    // An unknown /api path is an API error, not a page. Serving HTML there would hand a client
    // expecting JSON a document, and the failure would surface as a parse error somewhere else.
    if (c.req.path.startsWith('/api')) return c.json({ error: 'not-found' }, 404);

    // Otherwise the single-page app answers, so a deep link still boots the router — but with a
    // 404 status, because that is the only thing telling a crawler the page is not real. Same
    // rule the static-file host follows; see scripts/lib/static-server.mjs.
    const fallback = existsSync(join(dist, '404.html')) ? '404.html' : 'index.html';
    const html = await readFile(join(dist, fallback), 'utf8');
    return c.html(html, 404);
  });
}

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`✓ api on http://localhost:${PORT}`);
  console.log(WEB_DIST ? `  serving the built front end from ${WEB_DIST}` : '  no built front end');
});
