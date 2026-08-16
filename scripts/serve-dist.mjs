#!/usr/bin/env node
/**
 * Serves the built front end the way a static host does, proxying /api to the running API.
 *
 * Exists so the suite can run against the real build output — the dev server has different
 * module loading, no minification and its own proxy, so a bug that only appears in the build
 * is invisible to a suite that never sees one.
 *
 * The server itself is in lib/static-server.mjs, shared with the Lighthouse audit so both
 * measure a page served by identical rules.
 */
import { createStaticServer, listen } from './lib/static-server.mjs';

const [dist, port, apiPort] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];

await listen(createStaticServer({ dist, basePath: process.env.BASE_PATH ?? '/', apiPort }), port);
console.log(`serving ${dist} on ${port}`);
