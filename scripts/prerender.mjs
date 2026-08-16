#!/usr/bin/env node
/**
 * Write each public route out as a real HTML file with its text already in the markup.
 *
 * Two problems, one fix. A static host serves a single-page app by falling back to 404.html,
 * so every URL but `/` answers with a 404 *status* while rendering correctly — invisible to a
 * person, and exactly what a crawler records. And until the bundle has downloaded and run,
 * every one of those pages is `<div id="root"></div>`, so the first paint has nothing in it.
 *
 * Booting the built app in a browser and saving the resulting DOM fixes both: each route
 * becomes an ordinary file at its own path, and its text is in the HTML before any script
 * runs. The app still boots on top — main.tsx uses createRoot, not hydrateRoot, so it simply
 * replaces what is there and nothing has to match.
 *
 * Only the public pages. `/app` is deliberately left as the plain shell: prerendering it would
 * bake in whichever screen it happened to render here — the "no API behind this copy" one,
 * since nothing is serving the API during a build — and that would then be the markup even for
 * someone who deploys it with an API behind it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { baseFromShell, createStaticServer, listen } from './lib/static-server.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'packages/web/dist');

const PORT = Number(process.env.PRERENDER_PORT ?? 3494);

/** Rendered with their content in the markup. */
const PUBLIC_ROUTES = ['', 'ja'];
/** Given a file so the host answers 200, but left as the shell. See the note above. */
const SHELL_ROUTES = ['app', 'ja/app'];

const shell = readFileSync(join(DIST, 'index.html'), 'utf8');
// Not BASE_PATH: the build is the authority. See baseFromShell.
const BASE = baseFromShell(shell);
// The shell is read from the file this script later overwrites, so running twice without a
// build in between would take an already-rendered page as the shell and copy a page's text
// into 404.html. Requiring the root to be empty makes that a loud failure rather than a
// fallback page quietly carrying the home page's content.
if (!/<div id="root">\s*<\/div>/.test(shell)) {
  console.error(
    '✗ packages/web/dist/index.html is not an empty shell — it looks prerendered already.\n' +
      '  Run `npm run build` first: prerendering reads this file to produce 404.html, and a\n' +
      '  rendered page copied there would show its text at every unknown URL.',
  );
  process.exit(1);
}

const write = (route, html) => {
  const file = route ? join(DIST, route, 'index.html') : join(DIST, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
};

// Written before the root is overwritten below, so the fallback stays the untouched shell. A
// 404.html that is a copy of a prerendered page would show that page's text at every unknown
// URL, which is worse than an empty one.
writeFileSync(join(DIST, '404.html'), shell);
for (const route of SHELL_ROUTES) write(route, shell);

const server = createStaticServer({ dist: DIST, basePath: BASE });
await listen(server, PORT);

const browser = await chromium.launch();
try {
  for (const route of PUBLIC_ROUTES) {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}${BASE}${route}`, { waitUntil: 'networkidle' });
    // The heading is the thing worth having in the markup, so it is also the thing worth
    // waiting for — rather than a timeout, which is either too short on a loaded machine or
    // wasted on a fast one.
    await page.waitForSelector('h1', { timeout: 15000 });
    const html = await page.evaluate(
      () => `<!doctype html>\n${document.documentElement.outerHTML}`,
    );
    write(route, html);
    const lang = await page.evaluate(() => document.documentElement.lang);
    const heading = await page.textContent('h1');
    console.log(`  ${BASE}${route}  lang=${lang}  h1="${heading?.trim().slice(0, 48)}…"`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

/**
 * A sitemap, from the same list of routes that was just rendered.
 *
 * Generated rather than hand-written for the obvious reason: a hand-written one is a second
 * list of routes to keep in step, and the copy that drifts is always the one nobody looks at.
 *
 * SITE_URL is the origin the pages will be served from — the scheme and host only, with no
 * path. The path comes from the build's own base, so setting SITE_URL to something that
 * already includes it produces every URL twice over. Left unset it falls back to this
 * repository's Pages host, which is right here and wrong for a fork: a sitemap pointing at
 * someone else's domain is worse than no sitemap, so it is the one thing worth setting.
 */
const SITE = (process.env.SITE_URL ?? 'https://artoriun.github.io').replace(/\/$/, '');
const urls = PUBLIC_ROUTES.map((route) => `${SITE}${BASE}${route}`.replace(/\/$/, '') || SITE);
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((url) => `  <url><loc>${url}</loc></url>\n`).join('') +
    `</urlset>\n`,
);

// Pointing at it from robots.txt is what makes a crawler look without being told twice.
const robots = join(DIST, 'robots.txt');
if (existsSync(robots)) {
  const text = readFileSync(robots, 'utf8')
    .replace(/\s*Sitemap:.*$/m, '')
    .trimEnd();
  writeFileSync(robots, `${text}\n\nSitemap: ${SITE}${BASE}sitemap.xml\n`);
}

console.log(`  sitemap.xml with ${urls.length} url(s), and robots.txt pointing at it`);
console.log(
  `✓ prerendered ${PUBLIC_ROUTES.length} route(s); ${SHELL_ROUTES.length} left as the shell`,
);
