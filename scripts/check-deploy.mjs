#!/usr/bin/env node
/**
 * Runs render.yaml's own commands against a clean checkout, and then uses the result.
 *
 * This path has been broken twice without anything noticing, both times in ways the ordinary
 * suite structurally cannot see, because it never builds the way a host does:
 *
 *   1. `tsc` emits TypeScript and nothing else, so the .sql migrations never reached dist. The
 *      compiled server announced "already up to date" and died on the first query.
 *   2. NODE_ENV=production makes npm set omit=dev, and turbo, typescript and vite are all
 *      devDependencies — so the build had no build tools.
 *
 * Both answered /health perfectly well, which is why signing in is the check that matters here
 * rather than a status code from a route that touches nothing.
 *
 * The commands are read out of render.yaml rather than repeated, so this cannot drift from the
 * thing it is checking.
 */
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const blueprint = readFileSync('render.yaml', 'utf8');
const read = (key) => blueprint.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
const buildCommand = read('buildCommand');
const startCommand = read('startCommand');

/**
 * The blueprint's own envVars, so the build here is the build the host runs.
 *
 * Picking a few by hand is how this missed SITE_URL: the deploy prerendered a sitemap and a
 * social card naming a completely different site, and nothing here could see it because
 * nothing here set the variable that decides. Read them all, and the check stays honest as
 * the list grows.
 */
const BLUEPRINT_ENV = Object.fromEntries(
  [...blueprint.matchAll(/^\s*-\s*key:\s*(\S+)\s*\n\s*value:\s*'?([^'\n]*)'?\s*$/gm)].map((m) => [
    m[1],
    m[2].trim(),
  ]),
);
if (!buildCommand || !startCommand) {
  console.error('✗ could not read buildCommand/startCommand out of render.yaml');
  process.exit(1);
}

const PORT = Number(process.env.DEPLOY_CHECK_PORT ?? 4599);
const dir = mkdtempSync(join(tmpdir(), 'deploy-check-'));
const db = join(dir, 'check.db');
let server;

/**
 * Runs a build command, with output to a file rather than a pipe, and a ceiling on how long it
 * may take.
 *
 * Not `stdio: 'pipe'`: turbo leaves a daemon behind, and a daemon that inherits the pipe holds
 * it open after the build itself has exited — so the parent waits for end-of-file that never
 * comes and the whole thing hangs rather than failing. Writing to a file means nothing is
 * waiting on a reader. The timeout is the backstop for every other way a build can wedge; a
 * check that hangs is worse than one that fails, because it burns a runner and reports nothing.
 */
const BUILD_TIMEOUT_MS = 10 * 60_000;
const buildLog = join(dir, 'build.log');

const run = (cmd, opts = {}) => {
  try {
    // Braces around the whole command: `a && b > log` redirects only b, so when an earlier
    // step in the chain failed the log was never created and this reported ENOENT on the log
    // file instead of the actual failure.
    execSync(`{ ${cmd} ; } > ${buildLog} 2>&1 < /dev/null`, {
      cwd: dir,
      stdio: 'ignore',
      timeout: BUILD_TIMEOUT_MS,
      env: { ...process.env, ...opts.env },
    });
  } catch (err) {
    // The log may not exist if the shell itself could not start; say so rather than throwing a
    // second, less informative error on top of the first.
    const tail = existsSync(buildLog)
      ? readFileSync(buildLog, 'utf8').split('\n').slice(-40).join('\n')
      : '(the command produced no log at all)';
    const why =
      err.signal === 'SIGTERM' ? `timed out after ${BUILD_TIMEOUT_MS / 60_000}m` : 'failed';
    throw new Error(`${cmd}\n  ${why}. Last of its output:\n\n${tail}`);
  }
};

try {
  console.log('  exporting the tracked files as they stand…');
  // The working tree, not HEAD. `git archive HEAD` checks the last commit, so a change that
  // breaks the deploy passes right up until it is pushed — which is precisely the moment this
  // check is meant to be useful. Tracked files only, so node_modules and dist do not come along
  // and mask a build that cannot produce them.
  execSync(`git ls-files -z | tar --null -T - -cf - | tar -x -C ${dir}`, { stdio: 'pipe' });

  console.log(`  ${buildCommand}`);
  // Exactly the environment the blueprint declares. NODE_ENV is what broke it once; SITE_URL
  // is what the published URLs are built from.
  run(buildCommand, { env: BLUEPRINT_ENV });

  console.log(`  ${startCommand}`);
  // Its own process group, so the whole thing can be signalled at the end. `sh -c` may or may
  // not exec into the server depending on the shell, and where it does not, killing the child
  // leaves the real server running with its output pipe open — which keeps this process alive
  // long after it has printed its result.
  server = spawn('sh', ['-c', startCommand], {
    cwd: dir,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...BLUEPRINT_ENV,
      // The two that have to differ locally: a port nothing else is on, and a database this
      // script owns and deletes.
      PORT: String(PORT),
      DATABASE_URL: db,
    },
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));

  const base = `http://127.0.0.1:${PORT}`;
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await fetch(`${base}/health`)
      .then((r) => r.ok)
      .catch(() => false);
  }
  if (!up) throw new Error(`the server never became ready\n${log}`);

  const page = await fetch(base);
  if (!page.ok)
    throw new Error(`GET / answered ${page.status} — the front end is not being served`);
  const shell = await page.text();
  if (!shell.includes('id="root"')) throw new Error('GET / did not return the app shell');

  // Hashed assets have to be cacheable forever and the shell must not be, or a deploy either
  // costs every visitor a round trip per file or never reaches them at all. Checked against the
  // real asset name the build just produced, because the rule is a pattern match on that name
  // and a pattern is exactly the kind of thing that stops matching without anybody noticing.
  const asset = shell.match(/\/assets\/[^"']+\.(?:js|css)/)?.[0];
  if (!asset) throw new Error('found no hashed asset in the shell to check caching on');
  const assetCache = (await fetch(`${base}${asset}`)).headers.get('cache-control') ?? '';
  if (!assetCache.includes('immutable')) {
    throw new Error(`${asset} is not cacheable: cache-control: ${assetCache || '(none)'}`);
  }
  const shellCache = page.headers.get('cache-control') ?? '';
  if (!shellCache.includes('no-cache')) {
    throw new Error(`the shell must be revalidated; cache-control: ${shellCache || '(none)'}`);
  }

  // The deploy served a 1.4KB shell with no words in it for weeks, while the README described
  // prerendered pages — true of the Pages build, false of the one it linked to. These three
  // assertions are the difference, and each one was a real symptom of the same missing step.
  if (!/<h1[^>]*>/.test(shell)) {
    throw new Error('GET / has no heading in the markup — this build was not prerendered');
  }

  const sitemap = await fetch(`${base}/sitemap.xml`);
  const sitemapBody = await sitemap.text();
  if (!sitemapBody.startsWith('<?xml') && !sitemapBody.includes('<urlset')) {
    // It used to answer 200 with the app shell, because no sitemap existed and the catch-all
    // served HTML. A crawler following robots.txt got a web page where a list of URLs belonged.
    throw new Error(`/sitemap.xml is not a sitemap: ${sitemapBody.slice(0, 60)}…`);
  }

  const junk = await fetch(`${base}/definitely-not-a-route`);
  if (junk.status !== 404) {
    throw new Error(`an unknown path answered ${junk.status}; every URL cannot be a real page`);
  }

  // The security headers, and specifically that the policy did not fall back to allowing every
  // inline script. `unsafe-inline` is the easy way to make a CSP stop complaining and it gives
  // up most of what the policy was for, so it is worth failing on rather than discovering in a
  // scanner months later.
  const csp = page.headers.get('content-security-policy') ?? '';
  if (!csp.includes("script-src 'self' 'sha256-")) {
    throw new Error(`the page's script-src is not hash-pinned: ${csp || '(no policy at all)'}`);
  }
  for (const header of ['x-content-type-options', 'referrer-policy', 'x-frame-options']) {
    if (!page.headers.get(header)) throw new Error(`no ${header} on the page`);
  }

  // The published URLs have to name this deployment. SITE_URL is what decides that, and left
  // unset it falls back to the repository's Pages host — which is how the demo came to serve a
  // sitemap listing a different site's URLs, and a social card pointing there too. Compared
  // against the blueprint's own value rather than a literal, so this follows a rename.
  const siteUrl = BLUEPRINT_ENV.SITE_URL;
  // Its absence is the bug, not a reason to skip: unset, the prerenderer falls back to this
  // repository's Pages host and the deploy publishes a sitemap and a social card naming a
  // different site entirely. Skipping when it is missing checked everything except the case
  // that actually happened.
  if (!siteUrl) {
    throw new Error(
      'render.yaml declares no SITE_URL, so the published URLs will name the fallback host ' +
        'rather than this deployment',
    );
  }
  {
    const host = new URL(siteUrl).host;
    const robots = await (await fetch(`${base}/robots.txt`)).text();
    // og:url and og:image only, not every link on the page — "Read the source" points at
    // GitHub on purpose. These three are the ones that are supposed to name this deployment.
    const claims = [
      ['sitemap.xml', [...sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])],
      ['robots.txt', [...robots.matchAll(/Sitemap:\s*(\S+)/g)].map((m) => m[1])],
      [
        'the social tags',
        [...shell.matchAll(/<meta property="og:(?:url|image)" content="([^"]+)"/g)].map(
          (m) => m[1],
        ),
      ],
    ];
    for (const [what, urls] of claims) {
      const foreign = urls.find((u) => {
        try {
          return new URL(u).host !== host;
        } catch {
          return true;
        }
      });
      if (foreign) throw new Error(`${what} names ${foreign}, but this deployment is ${host}`);
    }
  }

  // The one that matters. Both previous breakages passed everything above this line.
  const signIn = await fetch(`${base}/api/auth/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'turboham@example.com', password: 'hamster-wheel-9000' }),
  });
  if (!signIn.ok) throw new Error(`sign-in answered ${signIn.status}: ${await signIn.text()}`);

  const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0];
  const me = await fetch(`${base}/api/me`, { headers: { cookie } });
  if (!me.ok)
    throw new Error(`the session did not survive one request: /api/me answered ${me.status}`);

  const { organisations } = await me.json();
  if (!organisations?.length) throw new Error('signed in, but the seeded organisation is missing');

  console.log(
    `✓ the blueprint builds, boots, serves the app, and signs in (${organisations[0].name})`,
  );
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      // Already gone, which is the outcome this was after anyway.
    }
  }
  rmSync(dir, { recursive: true, force: true });
  // The result is printed and the work is done; exiting says so rather than waiting on whatever
  // the build or the server left holding the event loop open.
  process.exit(process.exitCode ?? 0);
}
