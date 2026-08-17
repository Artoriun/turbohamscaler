# TurboHamscaler

<img src="docs/turboham-evolution.gif" alt="TurboHam evolving: the pixel hamster in teal headphones flashes white and grows, twice, ending as a broad-shouldered ogre with a heavy brow and a smirk" width="200" align="right">

A **TurboRepo** starter for a multi-tenant web app: accounts, organisations, roles and
per-tenant data, with the isolation checks that keep them honest.

It runs on nothing. No account, no container, no native build — `npm install && npm run dev`
gives you a working app with a seeded demo tenant. TurboHam scales by adding wheels; the rest of
this is the bit nobody enjoys writing twice.

[![CI](https://github.com/Artoriun/turbohamscaler/actions/workflows/ci.yml/badge.svg)](https://github.com/Artoriun/turbohamscaler/actions/workflows/ci.yml)

> ## 🚧 Work in progress — do not build on this yet
>
> This starter is under active development. It is public so the work can be followed, not
> because it is finished. The schema, the API and the layout of the packages will all change,
> breakingly and without a migration path. Treat nothing here as settled.

**Public pages:** https://artoriun.github.io/turbohamscaler/ — the app itself needs a server,
so run it locally to sign in.

<br clear="right">

> Building a portfolio or marketing site instead? That is
> [TurboHamstarter](https://github.com/Artoriun/turbohamstarter).

---

## Stack

| | |
| --- | --- |
| **Front end** | React, TypeScript, Vite, React Router |
| **Back end** | Hono, SQLite (`node:sqlite`) or Cloudflare D1 |
| **Tooling** | TurboRepo, Biome, Playwright |

Three workspaces: `packages/web`, `packages/api`, `packages/shared`.

---

## Quick start

```bash
npm install
npm run db:seed   # a demo tenant, so the app opens on something
npm run dev       # web on 3410, API on 4410
```

Sign in as `turboham@example.com` or `teemo@example.com`, password `hamster-wheel-9000`.
TurboHam runs a wheelwright's; Teemo is in bedding. They are in separate organisations on
purpose: sign in as one and the other's data is simply not there — no filter, no flag, nothing
to forget.

No `.env` is needed to run it. For production see [`.env.example`](.env.example).

### Scripts

```bash
npm run build          # production build
npm run prerender      # build, then write each public route out with its text in the markup
npm run ci             # everything CI runs, in order
npm run test           # API and unit tests
npm run test:api:worker # the same API tests, against a local Worker + D1
npm run test:e2e       # Playwright, against the dev server
npm run test:e2e:dist  # the same, against the built output
npm run check:tenancy  # structural guards on tenant isolation
npm run db:migrate     # apply pending migrations
npm run db:reset       # delete the local database and reseed
```

---

## Features

- **Accounts** — sign up, sign in, sign out, sign out everywhere; change your name, change
  your password, close your account. Passwords are hashed with Web Crypto PBKDF2 and sessions
  are opaque ids in a table, so revoking one actually revokes it — which is why changing a
  password ends every other session, and why closing an account is refused while it is the
  only owner of an organisation. Your live sessions
  are listed and can be ended one at a time, named by a hash prefix rather than by the session
  id — that id is the cookie, so a list of them would be a list of working keys
- **Organisations** you can create, rename and delete, with `member` / `admin` / `owner` roles
  and per-tenant projects. Roles can
  be changed, members removed, and anyone can leave — except the last owner, because an
  organisation with no owner is one nobody can administer their way out of
- **Invitations** — an admin issues a single-use token addressed to a person, who accepts it
  themselves. Only the token's hash is stored, and nothing is ever checked against the account
  list, so inviting cannot be used to ask which addresses are registered. No mail provider ships,
  by design: `packages/api/src/mailer.ts` is the seam, with a worked example in its comments and
  a default that logs instead of sending. Until you install one the token is returned to the
  admin to pass on by hand; install one and the API stops returning it
- **Tenant isolation** enforced in one file and proven by a suite written from the attacker's
  side — a valid session asking for another organisation's rows by id
- **Migrations** applied in order and hashed, so editing one that has already run is an error
  rather than a silent divergence
- **An audit log** of every membership and invitation change, append-only, admin-only, and
  keeping the actor's name as it was — a record whose subject has been deleted still reads
- **Rate-limited sign-in**, recorded in the database so a restart does not reset it
- **Seeded demo data**, two organisations, no cloud account
- **Light, dark or follow the system**, chosen before first paint so the theme never flashes
- **Prerendered public pages** — each route is a real file with its text already in the HTML,
  so a crawler that runs no JavaScript still sees the page and every URL answers 200, with a
  generated `sitemap.xml` and a `robots.txt` pointing at it

---

## How tenancy works

Every tenant-owned query lives in `packages/api/src/repo.ts` and takes `orgId` as its first
argument. Routes never write SQL. That keeps the number of places a tenant filter can be
forgotten at exactly one file.

Two checks back it up. `npm run check:tenancy` fails the build if a query touches a
tenant-owned table without filtering on `org_id`, or if SQL appears outside the repository
layer. `packages/api/src/isolation.test.ts` proves the behaviour end to end.

A non-member gets `404`, never `403`: a 403 confirms the organisation exists, which tells an
attacker enumerating ids exactly which ones are real.

---

## Adding a route

1. Add the handler in `packages/api/src/app.ts`.
2. Add it to `ROUTE_MANIFEST` at the bottom of that file, with what it requires.
3. Put any new query in `repo.ts`, taking `orgId` first.

`authMatrix.test.ts` reads that manifest and checks every route against an anonymous caller, a
non-member, and a member holding too low a role. A route with no manifest entry is not
covered — which is why step 2 is not optional.

---

## Testing

`npm run ci` runs the pipeline in CI's order: Biome, `tsc`, the tenancy guards, API and unit
tests, **the API tests again on a local Worker + D1**, the build, a gzipped bundle budget,
Playwright against the dev server, the suite again against the built output, and Lighthouse.

Running the API suite twice is the point: the same assertions pass on Node and on Workers, so
"it runs on both" is checked rather than asserted. It is all local — wrangler runs on Miniflare
— so it needs no Cloudflare account.

Accessibility is checked twice, because one check cannot reach everything. Lighthouse audits
the public page and `/app`, but it cannot sign in — so `e2e/a11y.spec.ts` sweeps the signed-in
portal with axe, in both themes, with a project, an invitation and an audit log on screen, and
again with a project open for editing. It gates serious and critical findings only; the rest
are advisory and a gate on them is noise. Neither check makes the app accessible — axe finds a
subset of problems, and a green sweep is a floor rather than a verdict.

Lighthouse gates accessibility, SEO, best-practices and CLS — all properties of the code. It
measures performance and prints it without gating: a shared runner's timings drift more than
the thing being measured, and the bundle budget is the half of performance that is
deterministic. `npm run ci` skips it locally for the same reason; run `npm run check:lighthouse`
on a quiet machine.

---

## Deployment

The two halves deploy separately.

**The public pages are static.** CI builds them with `VITE_BASE` and publishes to GitHub Pages
on every push to `main`. Set `BASE_PATH` at the top of `.github/workflows/ci.yml` to your own
repository name, or `/` for a custom domain. A static host needs `404.html` to be the app
itself, or a deep link never boots the router — the workflow copies `index.html` over it.

Nothing here has to be deployed for the starter to be useful — clone it and it runs. What
follows is how to put it somewhere when you want to.

**The app needs a server, and runs on two kinds.** The routes are a [Hono](https://hono.dev)
app built on the Request and Response of the Web platform, so the same code serves a Node
process or a Cloudflare Worker. Point the front end at whichever with `VITE_API_URL` at build
time. Served without one — as on the Pages deploy above — the portal says so rather than
showing a sign-in form that cannot work.

**Node, free to start** — [`render.yaml`](render.yaml) is a working blueprint. Be aware that a
free instance has no persistent disk, so the SQLite file does not survive a restart. Fine for
kicking the tyres; not a deployment.

**Cloudflare Workers + D1, when it needs to be real** — [`wrangler.toml`](wrangler.toml):

```bash
npx wrangler d1 create hamscaler          # paste the id into wrangler.toml
npx wrangler d1 migrations apply hamscaler --remote
npx wrangler deploy
```

Nothing in `packages/api/src` changes between the two. Three seams make that true: the routes
are Hono, the database is behind `Driver` (`db/index.ts` for Node, `db/d1.ts` for D1), and
password hashing is Web Crypto rather than `node:crypto`. `index.ts` is the Node entry point and
`worker.ts` the Workers one; both import the same app.

Workers' free plan allows 10ms of CPU per request, and hashing a password properly costs more
than that on purpose — so Workers means the $5/mo paid plan. Lowering the iteration count to fit
the free tier would be trading every stored password's security for the hosting bill.

**The pages and the API have to share a site.** The session cookie is `SameSite=Lax`, which is
what makes it immune to cross-site request forgery without a token dance, and the price is that
the browser will not send it on a cross-*site* request. `app.example.com` with
`api.example.com` is fine; one origin serving both is fine. GitHub Pages with a separate host
is not — different sites, so the cookie never arrives, which is why that deploy shows the
"no API" screen instead. Splitting them for real means `SameSite=None; Secure` **and** CSRF
tokens: a deliberate trade, not one to back into by setting `VITE_API_URL`.

`node:sqlite` writes to a local file, which suits a single instance — and a free instance
usually has no persistent disk, so the database is gone on every restart. Fine for a demo,
wrong for anything real: attach a disk, or point `DATABASE_URL` at a hosted database and
replace `packages/api/src/db/index.ts`, which nothing above the query helpers imports a driver
through.

Set `SITE_URL` to the origin the pages are served from — scheme and host only, no path. It is
what the sitemap is built from, and left unset it points at this repository's Pages host, which
is wrong for a fork.

**Node 22** is required (`.nvmrc`).

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — in particular the rules the build enforces, which
are checks rather than preferences.

---

## Licence

MIT — see [LICENSE](LICENSE).
