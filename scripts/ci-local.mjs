#!/usr/bin/env node
/**
 * Runs locally what CI runs, in CI's order, derived from the workflow itself.
 *
 * Not a hand-written list. A hand-written list is a fourth copy of the pipeline to keep in
 * sync, and the whole reason this exists is that copies drift: a sibling repo blocked a
 * deploy because the command run locally was `playwright test <one spec>` while the command
 * CI ran was `npm run test:e2e:dist`, which is the whole suite. Same intent, different
 * command, different result.
 *
 * Steps come from `.github/workflows/ci.yml` in order, so adding a CI step adds it here for
 * free. Anything needing a browser, a secret or the network in a way that cannot work on a
 * developer's machine is skipped with a reason rather than silently dropped.
 *
 * Usage: npm run ci            everything
 *        npm run ci -- --list  show what would run
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Steps that cannot run here, and why. A skip is a claim that the step is untestable
 * locally — not that it is inconvenient — so each one names the reason it prints.
 */
const SKIP = new Map([
  ['check:lighthouse', 'slow, and its numbers are only meaningful on a quiet machine'],
  ['check:lighthouse:vue', 'slow, and its numbers are only meaningful on a quiet machine'],
]);

/**
 * Ports the suite binds. Overridden away from the defaults because those collide with other
 * projects on a developer's machine, and a collision here reads as a test failure.
 */
const workflow = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');

// From the workflow's own env block, not a copy of it.
const baseFromWorkflow = workflow.match(/^\s*BASE_PATH:\s*(\S+)/m)?.[1];

/**
 * Ports for the local run, away from the ones `npm run dev` uses.
 *
 * A CI runner has the machine to itself; a developer does not. Reusing the dev ports means a
 * dev server left running turns the e2e steps into "port already in use", which reads as a
 * test failure and sends you looking at the wrong thing.
 */
const ENV = {
  ...process.env,
  WEB_PORT: process.env.WEB_PORT ?? '3491',
  API_PORT: process.env.API_PORT ?? '4491',
  ...(baseFromWorkflow ? { BASE_PATH: process.env.BASE_PATH ?? baseFromWorkflow } : {}),
};

// Only the checks, not the deploy job: publishing is not something to reproduce locally.
const deployAt = workflow.indexOf('\n  deploy:');
const checks = deployAt === -1 ? workflow : workflow.slice(0, deployAt);
// Line by line rather than one regular expression. A pattern that allowed arbitrary keys
// between `name:` and `run:` backtracked catastrophically and hung; requiring `run:` on the
// very next line instead silently dropped any step with a `continue-on-error:` in between.
// Neither failure is worth a clever pattern.
//
// Per-step `env:` is captured too. Without it the subpath step in one of these repos built at
// the domain root and the next step then tested that build as though it were the subpath
// variant — four failures that said nothing about the code.
const steps = [];
{
  let pending = null;
  let env = null;
  const flush = () => {
    pending = null;
    env = null;
  };
  for (const line of checks.split('\n')) {
    const name = line.match(/^\s+- name: (.+)$/);
    if (name) {
      pending = name[1].trim();
      env = null;
      continue;
    }
    const run = line.match(/^\s+run: (npm run [\w:-]+(?: && npm run [\w:-]+)*)\s*$/);
    if (run && pending) {
      steps.push({ name: pending, run: run[1].trim(), env: {} });
      env = steps.at(-1).env;
      pending = null;
      continue;
    }
    if (/^\s+env:\s*$/.test(line) && steps.length) {
      env = steps.at(-1).env;
      continue;
    }
    const pair = line.match(/^\s+([A-Z_][A-Z0-9_]*):\s*'?([^'\n]*)'?\s*$/);
    if (pair && env) {
      env[pair[1]] = pair[2];
      continue;
    }
    if (/^\s+- (uses|run):/.test(line)) flush();
  }
}

/**
 * A parse that matches nothing must not read as a clean run.
 *
 * These steps are recovered from YAML with a regular expression, so a change to how the
 * workflow is written — a different quoting style, a `run: |` block — can silently match
 * zero steps. Without this the script then reports "all steps passed" having executed
 * nothing at all, which is worse than failing.
 */
if (steps.length < 7) {
  console.error(
    `✗ parsed only ${steps.length} steps from .github/workflows/ci.yml — the workflow's shape ` +
      'has changed and this script is no longer reading it correctly',
  );
  process.exit(1);
}

if (process.argv.includes('--list')) {
  for (const s of steps) {
    const script = s.run.replace(/^npm run /, '').split(' ')[0];
    console.log(`${SKIP.has(script) ? 'skip' : 'run '}  ${s.name.padEnd(38)} ${s.run}`);
  }
  process.exit(0);
}

let failed = null;
const started = Date.now();

for (const step of steps) {
  const script = step.run.replace(/^npm run /, '').split(' ')[0];
  if (SKIP.has(script)) {
    console.log(`  skip  ${step.name} — ${SKIP.get(script)}`);
    continue;
  }
  // Overwrite the running line only where that works. Piped to a file or another process,
  // \r prints literally and every step appears twice.
  const live = process.stdout.isTTY;
  if (live) process.stdout.write(`  ....  ${step.name}`);
  const at = Date.now();
  try {
    execFileSync('sh', ['-c', step.run], {
      cwd: ROOT,
      env: { ...ENV, ...step.env },
      stdio: 'pipe',
    });
    process.stdout.write(
      `${live ? '\r' : ''}  pass  ${step.name} (${((Date.now() - at) / 1000).toFixed(0)}s)\n`,
    );
  } catch (err) {
    process.stdout.write(`${live ? '\r' : ''}  FAIL  ${step.name}\n\n`);
    // The output, not a summary: the point of running CI locally is to read the failure.
    process.stdout.write(err.stdout?.toString() ?? '');
    process.stderr.write(err.stderr?.toString() ?? '');
    failed = step.name;
    break;
  }
}

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(failed ? `\n✗ ${failed} failed after ${mins}m` : `\n✓ all steps passed in ${mins}m`);
process.exit(failed ? 1 : 0);
