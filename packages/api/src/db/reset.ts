/** Deletes the local database file and rebuilds it from migrations plus seed data. */
import { rmSync } from 'node:fs';
import { closeDb, databaseUrl } from './index.ts';
import { seed } from './seed.ts';

closeDb();
const url = databaseUrl();
if (url !== ':memory:') {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${url}${suffix}`, { force: true });
}
await seed();
