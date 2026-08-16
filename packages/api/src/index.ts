/**
 * Node entry point. Runs migrations before listening, so a fresh clone or a new deploy is
 * never serving against a schema that does not exist yet.
 *
 * This file is the Node half of the app and nothing else: the routes in app.ts are a Hono app
 * built on the Request and Response of the Web platform, so the same object is exported for a
 * Workers-style runtime by worker.ts. Only the thing that listens differs.
 */

import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { migrate } from './db/migrate.ts';

/**
 * PORT first: every managed host injects it and expects the process to bind exactly that,
 * failing the health check otherwise. API_PORT stays the local knob, so `npm run dev` and the
 * test harness keep choosing their own.
 */
const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 4410);

await migrate();
serve({ fetch: createApp().fetch, port: PORT }, () => {
  console.log(`✓ api on http://localhost:${PORT}`);
});
