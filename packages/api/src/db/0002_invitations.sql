-- Invitations: the only way into an organisation you did not create.
--
-- Before this, an admin added a member by supplying an address, and the API answered 404
-- "no-such-user" when nobody held it. That did two bad things at once: it let an admin put
-- someone into an organisation without their consent, and it answered "is this address
-- registered?" for any address asked — the exact question sign-in refuses to answer, since it
-- returns the same 401 whether the address exists or the password was wrong.
--
-- An invitation is addressed to a string. Nothing here is ever checked against the users
-- table, so there is no question to leak the answer to.

CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  -- As typed, for display, and lowercased for comparison — the same split as users.email,
  -- so "Ada@example.com" and "ada@example.com" cannot hold two invitations to one org.
  email       TEXT NOT NULL,
  email_key   TEXT NOT NULL,
  role        TEXT NOT NULL,
  -- The hash of the token, never the token. Whoever holds the database still cannot join an
  -- organisation with it; they would need the token, which exists only in the reply that
  -- created the invitation.
  token_hash  TEXT NOT NULL UNIQUE,
  invited_by  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  -- Set on acceptance rather than deleting the row, so an organisation keeps a record of who
  -- was let in and by whom.
  accepted_at BIGINT
);

CREATE INDEX IF NOT EXISTS invitations_by_org ON invitations (org_id, created_at);

-- One outstanding invitation per address per organisation. Partial, so a re-invitation is
-- possible once the first has been accepted or revoked.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_per_email
  ON invitations (org_id, email_key)
  WHERE accepted_at IS NULL;
