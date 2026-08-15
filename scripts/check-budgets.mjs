#!/usr/bin/env node

/**
 * Fails the build if the front end grows past its budget.
 *
 * The entry bundle is read from the freshly built index.html rather than by globbing
 * `dist/assets`: Turbo restores `dist/**` from cache, so stale hashed files accumulate there
 * and a glob ends up summing several builds at once — which reads as a sudden regression
 * nobody caused, or hides a real one behind an old smaller file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'packages/web/dist';
const BUDGET_KB = 90;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('✗ no build to measure — run `npm run build` first');
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);

if (refs.length === 0) {
  console.error(
    '✗ found no scripts or stylesheets in index.html — the build output is not shaped the way ' +
      'this script expects, so it is measuring nothing.',
  );
  process.exit(1);
}

let total = 0;
for (const ref of refs) {
  const file = join(DIST, ref.replace(/^\//, ''));
  if (!existsSync(file)) continue;
  const size = gzipSync(readFileSync(file)).length;
  total += size;
  console.log(`  ${ref.split('/').pop()}: ${(size / 1024).toFixed(1)}KB gzipped`);
}

const kb = total / 1024;
if (kb > BUDGET_KB) {
  console.error(`✗ initial payload ${kb.toFixed(1)}KB gzipped exceeds the ${BUDGET_KB}KB budget`);
  process.exit(1);
}
console.log(`✓ initial payload: ${kb.toFixed(1)}KB gzipped (budget ${BUDGET_KB}KB)`);
