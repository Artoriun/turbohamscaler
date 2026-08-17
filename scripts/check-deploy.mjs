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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const blueprint = readFileSync('render.yaml', 'utf8');
const read = (key) => blueprint.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'))?.[1]?.trim();
const buildCommand = read('buildCommand');
const startCommand = read('startCommand');
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
    execSync(`${cmd} > ${buildLog} 2>&1 < /dev/null`, {
      cwd: dir,
      stdio: 'ignore',
      timeout: BUILD_TIMEOUT_MS,
      env: { ...process.env, ...opts.env },
    });
  } catch (err) {
    const tail = readFileSync(buildLog, 'utf8').split('\n').slice(-40).join('\n');
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
  // NODE_ENV set exactly as the blueprint sets it, because that is what broke it last time.
  run(buildCommand, { env: { NODE_ENV: 'production' } });

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
      NODE_ENV: 'production',
      PORT: String(PORT),
      DATABASE_URL: db,
      DEMO_SEED: 'true',
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
  if (!(await page.text()).includes('id="root"'))
    throw new Error('GET / did not return the app shell');

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
