#!/usr/bin/env node
/**
 * Runs Lighthouse against the built output and fails the build on a regression.
 *
 * Only accessibility, SEO and best-practices are gated, plus CLS. Those inspect the markup and
 * how far the layout moved — properties of the code, so a threshold on them means what it says.
 * Performance is measured and printed but never gated: it is dominated by wall-clock timings
 * that drift with whatever else a shared runner is doing, and a gate that fails randomly gets
 * disabled within a fortnight. check-budgets.mjs is the deterministic half of performance, and
 * that one does gate.
 *
 * Serves the output itself rather than assuming a server is up, through the same static server
 * the end-to-end suite uses.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createStaticServer, listen } from './lib/static-server.mjs';

/**
 * Not execFileSync: that blocks the event loop until the child exits, but the child is
 * Lighthouse's own Chrome fetching pages from the server running in this very process. Blocked
 * loop, unservable request, and Lighthouse eventually reports "Target closed".
 */
function runLighthouse(args, env) {
  return new Promise((resolve, reject) => {
    const child = execFile('npx', args, { env }, (err) => (err ? reject(err) : resolve()));
    child.stderr?.pipe(process.stderr);
  });
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'packages/web/dist');
const BASE = (process.env.BASE_PATH ?? '/').replace(/\/?$/, '/');
const PORT = Number(process.env.LH_PORT ?? 3492);
const CHROME_PATH = chromium.executablePath();

/**
 * The public page, and the portal shell.
 *
 * The portal is worth auditing even without an API behind it: what it renders then is the
 * "no API behind this copy" screen, which is exactly what the Pages deploy shows every
 * visitor who opens the app.
 */
const ROUTES = ['', 'app'];

const THRESHOLDS = { accessibility: 100, seo: 100, 'best-practices': 100 };
const MAX_CLS = 0.05;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('✗ no build to audit — run `npm run build` first');
  process.exit(1);
}

const server = createStaticServer({ dist: DIST, basePath: BASE });
await listen(server, PORT);

let failed = false;
try {
  for (const route of ROUTES) {
    const url = `http://localhost:${PORT}${BASE}${route}`;
    const out = join(ROOT, `lighthouse-${route || 'home'}.json`);

    await runLighthouse(
      [
        'lighthouse',
        url,
        '--only-categories=performance,accessibility,best-practices,seo',
        '--form-factor=mobile',
        '--screenEmulation.mobile',
        '--output=json',
        `--output-path=${out}`,
        '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
        '--quiet',
      ],
      // Lighthouse's own launcher picks whatever Chrome it finds, which is a second browser to
      // provision and a different build from the one the layout tests use. Playwright's
      // Chromium is already a dependency and already installed in CI.
      { ...process.env, CHROME_PATH },
    );

    const report = JSON.parse(readFileSync(out, 'utf8'));
    const score = (id) => Math.round((report.categories[id].score ?? 0) * 100);

    console.log(`\n  ${url}`);
    console.log(
      `    performance ${score('performance')}  (not gated)  ` +
        `LCP ${report.audits['largest-contentful-paint'].displayValue}`,
    );

    const cls = report.audits['cumulative-layout-shift'].numericValue ?? 0;
    const clsOk = cls <= MAX_CLS;
    console.log(`    ${clsOk ? '✓' : '✗'} CLS ${cls.toFixed(3)} (max ${MAX_CLS})`);
    if (!clsOk) {
      failed = true;
      for (const item of (report.audits['layout-shifts']?.details?.items ?? []).slice(0, 5)) {
        const where = item.node?.selector ?? item.url ?? item.description;
        if (where) console.log(`        ${String(where).slice(0, 110)}`);
      }
    }

    for (const [id, min] of Object.entries(THRESHOLDS)) {
      const actual = score(id);
      const ok = actual >= min;
      console.log(`    ${ok ? '✓' : '✗'} ${id} ${actual} (min ${min})`);
      if (ok) continue;
      failed = true;
      // Without the failing audits this is just a number, and the first thing anyone reading a
      // red build does is re-run it locally to find out which one moved.
      for (const ref of report.categories[id].auditRefs) {
        const audit = report.audits[ref.id];
        if (audit.score === null || audit.score >= 1) continue;
        console.log(`        ${ref.id}: ${audit.title}`);
        for (const item of (audit.details?.items ?? []).slice(0, 5)) {
          const where = item.node?.selector ?? item.url ?? item.text ?? item.description;
          if (where) console.log(`          ${String(where).slice(0, 110)}`);
        }
      }
    }
  }
} finally {
  server.close();
}

console.log(failed ? '\n✗ lighthouse gate failed' : '\n✓ lighthouse gate passed');
process.exit(failed ? 1 : 0);
