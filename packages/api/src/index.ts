/**
 * Server entry point. Runs migrations before listening, so a fresh clone or a new deploy is
 * never serving against a schema that does not exist yet.
 */

import { createApp } from './app.ts';
import { migrate } from './db/migrate.ts';

const PORT = Number(process.env.API_PORT ?? 4410);

migrate();
createApp().listen(PORT, () => {
  console.log(`✓ api on http://localhost:${PORT}`);
});
