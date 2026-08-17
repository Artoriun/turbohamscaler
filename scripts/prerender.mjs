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
// The host is lowercased. GitHub hands the owner's name back with its display capitalisation,
// and a sitemap is a list of canonical URLs — "Artoriun.github.io" resolves the same but is not
// the address the pages are served from, which is the sort of near-miss a crawler is entitled
// to treat as a different location.
const SITE = (() => {
  const raw = (process.env.SITE_URL ?? 'https://artoriun.github.io').replace(/\/$/, '');
  try {
    const url = new URL(raw);
    url.hostname = url.hostname.toLowerCase();
    return url.origin;
  } catch {
    return raw.toLowerCase();
  }
})();

/**
 * Open Graph URLs, made absolute.
 *
 * index.html carries them as paths so Vite resolves them against the build's base, and a
 * crawler cannot do that — it has no page to resolve against, and a relative og:image is
 * simply dropped. The origin is only known here, which is also the point: the same build is
 * served from Pages under a subpath and from the demo host at its root, so the value differs
 * per deployment and cannot be a constant in the shell.
 */
function absoluteSocialUrls(html, route) {
  const canonical = `${SITE}${BASE}${route}`.replace(/\/$/, '') || SITE;
  // Already absolute means this page was rendered from a shell an earlier route had rewritten
  // — the static server serves what has just been written — so prefixing again would produce
  // https://host/https://host/og.png, which it did.
  // Vite has already resolved the path against the build's base — it rewrites root-relative
  // URLs in the shell, meta tags included — so only the origin is missing. Adding the base a
  // second time produced /turbohamscaler/turbohamscaler/og.png.
  const absolute = (value) =>
    /^https?:\/\//.test(value)
      ? value
      : `${SITE}${value.startsWith('/') ? value : `${BASE}${value}`}`;
  return html
    .replace(
      /(<meta property="og:image" content=")([^"]*)(")/,
      (_m, a, value, b) => `${a}${absolute(value)}${b}`,
    )
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${canonical}$2`);
}

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
    write(route, absoluteSocialUrls(html, route));
    const lang = await page.evaluate(() => document.documentElement.lang);
    const heading = await page.textContent('h1');
    console.log(`  ${BASE}${route}  lang=${lang}  h1="${heading?.trim().slice(0, 48)}…"`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

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

/**
 * The social tags have to be absolute, and correct, in every build.
 *
 * Checked rather than trusted because this went wrong three ways while it was being written:
 * the base was dropped, then added twice, then a page rendered from an already-rewritten shell
 * came out with the origin in it twice. None of those show up anywhere except in a preview on
 * somebody else's website, which is the last place to find out.
 */
for (const route of PUBLIC_ROUTES) {
  const html = readFileSync(join(DIST, route, 'index.html'), 'utf8');
  for (const property of ['og:image', 'og:url']) {
    const value = html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`))?.[1];
    if (!value || !/^https?:\/\/[^/]+\//.test(`${value}/`)) {
      throw new Error(`${property} on /${route} is not an absolute URL: ${value ?? '(missing)'}`);
    }
    if (value.split('://')[1]?.includes('//') || /(\/[^/]+)\1(\/|$)/.test(value)) {
      throw new Error(`${property} on /${route} has a doubled path: ${value}`);
    }
  }
}

console.log(`  sitemap.xml with ${urls.length} url(s), and robots.txt pointing at it`);
console.log(
  `✓ prerendered ${PUBLIC_ROUTES.length} route(s); ${SHELL_ROUTES.length} left as the shell`,
);
