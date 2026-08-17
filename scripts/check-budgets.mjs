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

/**
 * The images, which the number above does not include and which the page still has to fetch.
 *
 * This called itself an "initial payload" budget while measuring scripts and stylesheets only.
 * That is the part a code change moves, so it stays the gate — but a mascot swapped for
 * something four times the size would not have shown up anywhere, and it lands on the same
 * first paint. Budgeted separately rather than added to the same number, because they are
 * different mistakes with different fixes: one is code, the other is an export setting.
 */
const IMAGE_BUDGET_KB = 120;
// Followed from the shell *through* the bundles, not globbed from dist/assets. The mascot is
// imported by a component and the sprite comes from a CSS url(), so neither appears in
// index.html — and a glob would sum stale hashed files that turbo restored from cache.
//
// src and href only in the shell, not meta content: the social card is fetched by whatever
// unfurls a link, never by somebody visiting the page.
const IMAGE = /[^"'()\s]+\.(?:png|jpe?g|gif|svg|webp)/g;
const images = [
  ...[...html.matchAll(/(?:src|href)="([^"]+\.(?:png|jpe?g|gif|svg|webp))"/g)].map((m) => m[1]),
  ...refs.flatMap((ref) => {
    const file = join(DIST, ref.replace(/^\//, ''));
    return existsSync(file) ? [...readFileSync(file, 'utf8').matchAll(IMAGE)].map((m) => m[0]) : [];
  }),
].filter((ref, i, all) => all.indexOf(ref) === i);

let imageTotal = 0;
for (const ref of images) {
  const file = join(DIST, ref.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, ''));
  if (!existsSync(file)) continue;
  // Gzipped, like the rest: a PNG barely compresses, but the number a visitor waits for is
  // what comes over the wire, and every host serving this compresses what it can.
  const size = gzipSync(readFileSync(file)).length;
  imageTotal += size;
  console.log(`  ${ref.split('/').pop()}: ${(size / 1024).toFixed(1)}KB gzipped`);
}

const imageKb = imageTotal / 1024;
if (imageKb > IMAGE_BUDGET_KB) {
  console.error(`✗ images ${imageKb.toFixed(1)}KB gzipped exceed the ${IMAGE_BUDGET_KB}KB budget`);
  process.exit(1);
}
console.log(
  `✓ images the page loads: ${imageKb.toFixed(1)}KB gzipped (budget ${IMAGE_BUDGET_KB}KB)`,
);
