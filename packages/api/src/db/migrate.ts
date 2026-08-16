/**
 * Applies every .sql file in this directory, in filename order, once.
 *
 * Deliberately not a migration framework: a starter should be readable end to end, and the
 * whole mechanism is the twenty lines below. Applied files are recorded by name *and* by a
 * hash of their contents, so editing a migration that has already run is an error rather than
 * a silent divergence between your database and everyone else's — the failure mode that makes
 * "works on my machine" unfixable.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, exec, run } from './index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

interface Applied {
  name: string;
  hash: string;
}

export async function migrate(log: (msg: string) => void = console.log): Promise<void> {
  await exec(`CREATE TABLE IF NOT EXISTS migrations (
    name       TEXT PRIMARY KEY,
    hash       TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Map(
    (await all<Applied>('SELECT name, hash FROM migrations')).map((m) => [m.name, m.hash]),
  );
  const files = readdirSync(HERE)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const name of files) {
    const sql = readFileSync(join(HERE, name), 'utf8');
    const hash = createHash('sha256').update(sql).digest('hex').slice(0, 16);
    const seen = applied.get(name);

    if (seen === hash) continue;
    if (seen && seen !== hash) {
      throw new Error(
        `migration ${name} changed after it was applied (${seen} -> ${hash}). Add a new file ` +
          'instead: everyone else has already run the old contents, so editing it in place ' +
          'leaves their database and yours permanently different.',
      );
    }

    await exec(sql);
    await run(
      'INSERT INTO migrations (name, hash, applied_at) VALUES (?, ?, ?)',
      name,
      hash,
      Date.now(),
    );
    log(`  applied ${name}`);
    count++;
  }
  log(count === 0 ? '✓ database already up to date' : `✓ applied ${count} migration(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await migrate();
