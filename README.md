# TurboHamscaler

<img src="docs/turboham-evolution.gif" alt="TurboHam evolving: the pixel hamster in teal headphones flashes white and grows, twice, ending as a broad-shouldered ogre with a heavy brow and a smirk" width="200" align="right">

A **TurboRepo** starter for a multi-tenant web app: accounts, organisations, roles and
per-tenant data, with the isolation checks that keep them honest.

It runs on nothing. No account, no container, no native build — `npm install && npm run dev`
gives you a working app with a seeded demo tenant. TurboHam scales by adding wheels.

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
| **Back end** | Express, SQLite (`node:sqlite`) |
| **Tooling** | TurboRepo, Biome, Playwright |

Three workspaces: `packages/web`, `packages/api`, `packages/shared`.

---

## Quick start

```bash
npm install
npm run db:seed   # a demo tenant, so the app opens on something
npm run dev       # web on 3410, API on 4410
```

Sign in as `ada@example.com` or `grace@example.com`, password `hamster-wheel-9000`. They are
in separate organisations on purpose: sign in as one and the other's data is simply not there.

No `.env` is needed to run it. For production see [`.env.example`](.env.example).

### Scripts

```bash
npm run build          # production build
npm run prerender      # build, then write each public route out with its text in the markup
npm run ci             # everything CI runs, in order
npm run test           # API and unit tests
npm run test:e2e       # Playwright, against the dev server
npm run test:e2e:dist  # the same, against the built output
npm run check:tenancy  # structural guards on tenant isolation
npm run db:migrate     # apply pending migrations
npm run db:reset       # delete the local database and reseed
```

---

## Features

- **Accounts** — sign up, sign in, sign out, sign out everywhere. Passwords hashed with
  scrypt; sessions are opaque ids in a table, so revoking one actually revokes it
- **Organisations** with `member` / `admin` / `owner` roles, and per-tenant projects. Roles can
  be changed, members removed, and anyone can leave — except the last owner, because an
  organisation with no owner is one nobody can administer their way out of
- **Invitations** — an admin issues a single-use token addressed to a person, who accepts it
  themselves. Only the token's hash is stored, and nothing is ever checked against the account
  list, so inviting cannot be used to ask which addresses are registered
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
  so a crawler that runs no JavaScript still sees the page and every URL answers 200

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
tests, the build, a gzipped bundle budget, Playwright against the dev server, the suite again
against the built output, and Lighthouse.

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

**The app needs a server.** It is a plain Express app and fits the free tier of most hosts;
[`render.yaml`](render.yaml) is a working blueprint for one. Point the front end at it with
`VITE_API_URL` at build time. Served without one — as on the Pages deploy above — the portal
says so rather than showing a sign-in form that cannot work.

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

**Node 22** is required (`.nvmrc`).

---

## Licence

MIT — see [LICENSE](LICENSE).
