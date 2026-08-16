#!/usr/bin/env node
/**
 * Two structural rules that keep tenant isolation reviewable:
 *
 *  1. Only repo.ts writes SQL against tenant-owned tables. A route that reaches for the
 *     database directly is a tenant filter nobody will think to look for.
 *  2. Every query in repo.ts that touches a tenant-owned table filters on org_id.
 *
 * Neither replaces isolation.test.ts, which proves behaviour. These catch the same mistake
 * one layer earlier, and — more usefully — catch it in a query that no test happens to cover
 * yet, which is where the next leak will be.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const API = 'packages/api/src';
/** Tables whose rows belong to exactly one organisation. */
const TENANT_TABLES = ['projects', 'invitations'];
/**
 * A query may opt out by writing `tenancy-exempt:` followed by the reason in the doc comment
 * above it. Accepting an invitation is the case this exists for: the token is what names the
 * organisation, so there is no orgId to filter on yet.
 *
 * Deliberately not a list of function names kept here — an exemption belongs next to the query
 * it excuses, where a reviewer reading that query cannot miss it. The count is printed on every
 * run so exemptions cannot quietly multiply.
 */
const EXEMPT = /tenancy-exempt:\s*\S/;
/** Files allowed to contain SQL at all. */
const SQL_ALLOWED = ['repo.ts', 'auth.ts', 'signInAttempts.ts', 'db/index.ts', 'db/migrate.ts'];

const problems = [];
let statementsChecked = 0;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const files = walk(API).filter((f) => !f.endsWith('.test.ts') && !f.includes('/testing/'));

// ── rule 1: SQL only where it is allowed ─────────────────────────────────────────────────
for (const file of files) {
  const rel = file.slice(`${API}/`.length);
  if (SQL_ALLOWED.some((a) => rel === a)) continue;
  const src = readFileSync(file, 'utf8');
  // String literals only. Scanning the whole file for the bare words caught prose twice — a
  // comment reading "a self-delete on the one above" is not a query, and rewording English to
  // appease a regular expression is how a check stops being believed.
  const literals = src.match(/(['"`])[\s\S]*?\1/g) ?? [];
  if (literals.some((lit) => /^(['"`])\s*(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/i.test(lit))) {
    problems.push(
      `${file}: contains SQL. Tenant queries belong in repo.ts, behind a function that takes orgId.`,
    );
  }
}

// ── rule 2: every tenant-table query filters on org_id ────────────────────────────────────
const repoSrc = readFileSync(join(API, 'repo.ts'), 'utf8');
// Statements are single-quoted or backticked strings starting with a SQL verb.
const statements =
  repoSrc.match(/(['`])\s*(SELECT|INSERT INTO|UPDATE|DELETE FROM)[\s\S]*?\1/gi) ?? [];

let exempted = 0;
for (const raw of statements) {
  const sql = raw.slice(1, -1).replace(/\s+/g, ' ').trim();
  const touchesTenantTable = TENANT_TABLES.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(sql));
  if (!touchesTenantTable) continue;
  statementsChecked++;
  const filtered =
    /org_id\s*=\s*\?/i.test(sql) || /INSERT INTO\s+\w+\s*\([^)]*\borg_id\b/i.test(sql);
  if (filtered) continue;
  // The doc comment attached to this query — everything between the previous statement and
  // this one — is where an exemption has to be written for it to count.
  const preceding =
    repoSrc
      .slice(0, repoSrc.indexOf(raw))
      .split(/\n\s*\n/)
      .pop() ?? '';
  if (EXEMPT.test(preceding)) {
    exempted++;
    continue;
  }
  problems.push(`repo.ts: query touches a tenant table without an org_id filter:\n      ${sql}`);
}

// Without this the loop above can pass having inspected nothing — if the regex stops matching
// the way statements are written, every rule here silently becomes a no-op.
if (statementsChecked === 0) {
  console.error(
    '✗ parsed no tenant-table statements from repo.ts — the SQL is written in a shape this ' +
      'script no longer recognises, so it is checking nothing. Fix the parser, not this line.',
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error('✗ tenancy check failed:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `✓ tenancy: ${statementsChecked} tenant-table statement(s), ${statementsChecked - exempted} ` +
    `filtered on org_id, ${exempted} exempt with a stated reason`,
);
