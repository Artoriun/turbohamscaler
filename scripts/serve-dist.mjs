#!/usr/bin/env node
/**
 * Serves the built front end the way a static host does, proxying /api to the running API.
 *
 * Exists so the suite can run against the real build output — the dev server has different
 * module loading, no minification and its own proxy, so a bug that only appears in the build
 * is invisible to a suite that never sees one.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, normalize } from 'node:path';

const [dist, port, apiPort] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.gif': 'image/gif',
  '.png': 'image/png',
};

createServer((req, res) => {
  if (req.url.startsWith('/api') || req.url.startsWith('/health')) {
    const proxy = httpRequest(
      { host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: req.headers },
      (upstream) => {
        res.writeHead(upstream.statusCode ?? 502, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on('error', () => res.writeHead(502).end());
    req.pipe(proxy);
    return;
  }
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
    /^(\.\.[/\\])+/,
    '',
  );
  let file = join(dist, path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${dist} on ${port}`));
