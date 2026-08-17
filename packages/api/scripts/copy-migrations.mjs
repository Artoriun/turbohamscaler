#!/usr/bin/env node
/**
 * Copies the .sql migrations next to the compiled JavaScript.
 *
 * `tsc` emits TypeScript and nothing else, so the migrations were left behind in a compiled
 * build. migrate() read an empty directory, announced that the database was already up to date,
 * and the first real query then failed against a table that had never been created — while
 * /health kept answering, because it does not touch the database.
 */
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '../src/db');
const to = join(here, '../dist/db');

mkdirSync(to, { recursive: true });
const files = readdirSync(from).filter((f) => f.endsWith('.sql'));
if (files.length === 0) {
  console.error(`✗ no .sql migrations in ${from} — the build would produce a schemaless deploy`);
  process.exit(1);
}
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`✓ copied ${files.length} migration(s) into dist`);
