#!/usr/bin/env node
/**
 * Runs the API suite against the Worker instead of the Node server.
 *
 * The claim this exists to check is that the API behaves the same on both runtimes. Asserting
 * that in a README is free; running the same assertions against a Worker talking to a real D1
 * is not, and it is the only version of the claim worth anything.
 *
 * Everything is local: `wrangler dev --local` runs on Miniflare with a local D1 file, so this
 * needs no Cloudflare account and costs nothing.
 */
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const PORT = Number(process.env.WORKER_PORT ?? 8788);
const BASE = `http://127.0.0.1:${PORT}`;

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });

// A database left over from a previous run would still hold its users. The suite makes its own
// addresses unique, so this is belt and braces — but a migration that changed shape would
// otherwise be applied on top of the old one.
rmSync('.wrangler/state/v3/d1', { recursive: true, force: true });

console.log('  applying migrations to the local D1…');
if (run('npx', ['wrangler', 'd1', 'migrations', 'apply', 'hamscaler', '--local']).status !== 0) {
  console.error('✗ could not migrate the local D1');
  process.exit(1);
}

console.log(`  starting the Worker on ${PORT}…`);
// LOG_LEVEL=silent: the API writes a structured line per request, and in here every one of
// those goes through `wrangler dev`'s console relay. A few hundred requests of test traffic
// through that relay wedged it — a single request hung for five minutes and the run failed on
// a timeout rather than on anything being tested. The lines are wanted in production and are
// noise here; what this suite is checking is the API's behaviour on Workers.
// --var, not an environment variable: wrangler does not pass this process's env into the
// Worker — only wrangler.toml's [vars] and --var reach it — so setting LOG_LEVEL here had no
// effect at all, which took a bisect to notice.
//
// Silent because the API writes a structured line per request and every one of them goes
// through `wrangler dev`'s console relay. A few hundred requests of test traffic wedged that
// relay: one request hung for five minutes and the suite failed on a timeout rather than on
// anything it was checking. The lines are wanted in production; here they are noise.
const worker = spawn(
  'npx',
  ['wrangler', 'dev', '--local', '--port', String(PORT), '--var', 'LOG_LEVEL:silent'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
worker.stdout.on('data', (d) => {
  log += d;
});
worker.stderr.on('data', (d) => {
  log += d;
});

const ready = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

let code = 1;
try {
  if (!(await ready())) {
    console.error(`✗ the Worker never became ready\n${log}`);
    process.exit(1);
  }
  console.log('  running the API suite against the Worker\n');
  code =
    run(
      'node',
      [
        '--disable-warning=ExperimentalWarning',
        '--import',
        'tsx',
        '--test',
        'packages/api/src/**/*.test.ts',
      ],
      { env: { ...process.env, API_BASE: BASE } },
    ).status ?? 1;
} finally {
  worker.kill('SIGTERM');
}

console.log(
  code === 0
    ? '\n✓ the API behaves the same on Workers + D1'
    : '\n✗ suite failed against the Worker',
);
process.exit(code);
