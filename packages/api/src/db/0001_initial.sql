-- Schema, applied by migrate.ts in filename order.
--
-- SQLite because it needs no account, no daemon and no container to run: `npm install && npm
-- run dev` gives a working database. This DDL is dialect-neutral on purpose and runs unchanged
-- on SQLite, D1 and Postgres — which is checked, not asserted: the same API suite runs against
-- all three.
--
-- Two things that neutrality costs, both worth knowing before adding a column:
--   BIGINT, not INTEGER, for anything holding Date.now(). Postgres's INTEGER is 32 bits and a
--   millisecond timestamp overflows it in 1970 + 24 days. SQLite reads BIGINT as INTEGER
--   affinity, so it changes nothing there.
--   No PRAGMA. It is SQLite-only syntax and Postgres rejects the statement. Foreign keys are
--   turned on where the connection is made (db/index.ts); D1 has them on already.
--
-- Every tenant-owned table carries org_id as the FIRST column of its primary lookup index.
-- That is what makes a missing tenant filter a slow query rather than a silent data leak, and
-- what the isolation tests assert.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  -- Stored lowercased and compared here rather than in application code: two rows differing
  -- only by case are two accounts one person cannot tell apart.
  email_key   TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  password    TEXT NOT NULL,
  created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS organisations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  created_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  org_id      TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  created_at  BIGINT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS memberships_by_user ON memberships (user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  BIGINT NOT NULL,
  created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS projects_by_org ON projects (org_id, created_at);

-- Failed sign-in attempts, per address. Survives a restart, which an in-process counter does
-- not — and a free-tier host restarts often.
CREATE TABLE IF NOT EXISTS sign_in_attempts (
  email_key   TEXT PRIMARY KEY,
  failures    INTEGER NOT NULL DEFAULT 0,
  first_at    BIGINT NOT NULL,
  last_at     BIGINT NOT NULL
);
