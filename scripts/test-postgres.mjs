#!/usr/bin/env node
/**
 * The API suite, against Postgres.
 *
 * A wrapper for the same reason scripts/e2e-dist.mjs is one: `VAR=value cmd` is shell syntax
 * Windows does not have, and a variable set here and inherited by the child behaves the same
 * everywhere.
 */
import { spawn } from 'node:child_process';

const child = spawn(
  'node',
  [
    '--disable-warning=ExperimentalWarning',
    '--import',
    'tsx',
    '--test',
    'packages/api/src/**/*.test.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, API_DRIVER: 'postgres' } },
);

child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
