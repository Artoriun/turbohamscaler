-- Per-session write throttling.
--
-- LIMITS.writesPerMinute has existed since the first commit, described as "writes per session
-- per minute, so one bad client cannot saturate a free-tier database" — and nothing read it. A
-- declared limit that enforces nothing is worse than no limit, because it reads as protection
-- and stops anyone looking further.
--
-- In the database rather than in memory for the same reason sign_in_attempts is: a free-tier
-- host restarts often, and a Worker isolate holds no state between requests at all, so an
-- in-process counter is reset by the platform far more often than by the clock.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS write_rate (
  -- Cascades with the session, so signing out or expiring cleans the row up and there is no
  -- separate sweep to forget to write.
  session_id   TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  window_start INTEGER NOT NULL,
  writes       INTEGER NOT NULL DEFAULT 0
);
