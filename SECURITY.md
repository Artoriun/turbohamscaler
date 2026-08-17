# Security

This is a starter, not a service. There is nothing running that holds anybody's data except
the demo, which reseeds itself from two fictional hamsters on every restart.

## Reporting something

Open a [security advisory](https://github.com/Artoriun/turbohamscaler/security/advisories/new)
rather than a public issue. If that is not available to you, an ordinary issue is fine — say
what you found and skip the working exploit.

There is no bounty, and no timeline anyone should rely on. This is one person's project.

## What is claimed, and what is not

The README makes specific claims. These are the ones worth holding it to:

- **Tenant isolation.** Every tenant-owned query filters on `org_id`, enforced by
  `npm run check:tenancy` and proved from the attacker's side in `isolation.test.ts`. A
  non-member gets 404 rather than 403, so membership cannot be enumerated.
- **Passwords** are PBKDF2 via Web Crypto, 600,000 iterations, per-password salt, with the
  scheme and cost stored alongside so they can be raised later. An unknown scheme fails closed.
- **Sessions** are opaque random ids in a table, so revocation is real. The list of your own
  sessions names them by a hash prefix, never by the id, because the id is the cookie.
- **Enumeration.** Sign-in answers the same 401 whether the address is unknown or the password
  is wrong, and verifies against a throwaway hash when there is no user so the timing matches.
  Invitations never consult the account list. Sign-up is the deliberate exception: it has to
  say an address is taken, and the README says so.

Not claimed, and worth knowing before this holds anything real:

- **No CSRF tokens.** The session cookie is `SameSite=Lax`, which is what makes them
  unnecessary — and stops being true the moment the pages and the API are on different sites.
- **Sign-in throttling is per address**, so anyone can lock a known address out for the window
  by failing enough times. Per-IP limiting is the missing half, and belongs at the edge.
- **No email verification**, no password reset, no MFA, no audit of reads.
- **The rate limits are per session**, and a client can always get a new session.
