# Contributing

## Before anything

```bash
npm install
npm run db:seed
npm run dev        # web on 3410, API on 4410
```

`npm run ci` runs the whole pipeline in the order CI runs it, derived from
`.github/workflows/ci.yml` rather than duplicated — adding a step to the workflow adds it here
for free. Run it before opening a pull request; it is the same thing that will decide whether
yours is green.

Lighthouse is skipped locally, because its numbers only mean something on a quiet machine. Run
`npm run check:lighthouse` yourself if you have touched anything that renders.

## The rules the build actually enforces

These are not style preferences. Each one is a check that will fail.

**Tenant queries live in `packages/api/src/repo.ts` and take `orgId` first.** SQL anywhere else
fails `npm run check:tenancy`, as does a query against a tenant-owned table without an `org_id`
filter. A query that genuinely cannot filter — accepting an invitation, where the token is what
names the organisation — opts out by writing `tenancy-exempt:` and the reason in its doc comment.
The count of exemptions is printed on every run so they cannot quietly multiply.

**Every route goes in `ROUTE_MANIFEST`.** `authMatrix.test.ts` reads it and checks each route
against an anonymous caller, a member of another organisation, and a member holding too low a
role. A route with no entry is not covered, which is why the manifest is not optional.

**A non-member gets `404`, never `403`.** A 403 confirms the organisation exists, which is a
membership oracle for anyone enumerating ids.

**The API must run on both runtimes.** `npm run test:api` runs the suite on Node;
`npm run test:api:worker` runs the same suite against a real Worker and a local D1, on Miniflare,
needing no Cloudflare account. Anything runtime-specific — `node:crypto`, `node:fs`, an Express
idiom — breaks the second one. The seams that keep this true are `db/index.ts` (the `Driver`
interface), `password.ts` (Web Crypto, not `node:crypto`) and the routes being Hono.

## Writing a test

Make it fail first. Every guard in this repository was checked by removing the thing it guards
and watching the suite go red — several tests that looked fine turned out to assert nothing when
that was tried, and one of them is still in the history as a comment explaining what it does not
prove. A test nobody has seen fail is a claim, not a check.

Where a property genuinely cannot be tested, say so in the file rather than implying coverage.
`password.test.ts` does this for the constant-time comparison: swapping it for `===` passes every
assertion, because timing is not visible to a functional test.

## Things that will surprise you

- The database helpers are **async** even on Node, where the driver is synchronous. That is what
  lets D1 sit behind the same interface.
- `npm run prerender` rebuilds first and refuses to run against a non-empty shell, because it
  reads `index.html` to produce `404.html`.
- Scripts read the base path out of the built HTML, never from `BASE_PATH`. A build made at `/`
  and served at `/turbohamscaler/` matches no route, and prerendering then writes the not-found
  page out as the home page.
- Test addresses are made unique by the harness, so suites do not assume an empty database — the
  Worker's D1 outlives the process.

## Style

Biome decides. `npm run format` before committing; `npm run check` is what CI runs.

Comments explain **why**, not what. If a line needs a comment to say what it does, the line is
the problem.
