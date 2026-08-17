-- Who did what, per organisation.
--
-- The question every multi-tenant app is eventually asked — "who removed them?" — has no answer
-- from the tables above, because they only hold the current state. A membership that was
-- granted and revoked leaves nothing behind at all.
--
-- Append-only by convention: nothing in the API updates or deletes a row here. The actor is
-- kept as an id *and* as the name and address they had at the time, because the point of a
-- record is to still make sense after the account it refers to is gone.

CREATE TABLE IF NOT EXISTS audit_events (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- e.g. 'member.role-changed', 'member.removed', 'member.left', 'invitation.created'.
  action       TEXT NOT NULL,
  -- ON DELETE SET NULL rather than CASCADE: deleting an account must not quietly remove the
  -- record of what it did, which is the one thing an audit log exists to prevent.
  actor_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_label  TEXT NOT NULL,
  -- What was acted upon, in words, so reading the log needs no joins against rows that may no
  -- longer exist: an address for an invitation, a name for a member.
  subject      TEXT NOT NULL DEFAULT '',
  detail       TEXT NOT NULL DEFAULT '',
  created_at   BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_by_org ON audit_events (org_id, created_at DESC);
