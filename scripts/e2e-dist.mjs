#!/usr/bin/env node
/**
 * Runs the end-to-end suite against the built output.
 *
 * This exists to set one environment variable. `E2E_TARGET=dist playwright test` is shell
 * syntax Windows does not have, and the alternative — having the config sniff `--project=dist`
 * out of process.argv — worked locally and picked the dev target in CI, which pointed the
 * suite at a port nothing was listening on. A variable set in this process and inherited by
 * the child is the same on every platform and needs nothing guessed.
 */
import { spawn } from 'node:child_process';

const child = spawn('npx', ['playwright', 'test', '--project=dist', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, E2E_TARGET: 'dist' },
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
