/**
 * Server entry point. Runs migrations before listening, so a fresh clone or a new deploy is
 * never serving against a schema that does not exist yet.
 */

import { createApp } from './app.ts';
import { migrate } from './db/migrate.ts';

/**
 * PORT first: every managed host injects it and expects the process to bind exactly that,
 * failing the health check otherwise. API_PORT stays the local knob, so `npm run dev` and the
 * test harness keep choosing their own.
 */
const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 4410);

migrate();
createApp().listen(PORT, () => {
  console.log(`✓ api on http://localhost:${PORT}`);
});
