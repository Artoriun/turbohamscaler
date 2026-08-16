/**
 * The static host the built front end is tested against, shared by every script that needs one.
 *
 * One implementation on purpose. Two scripts each serving `dist` their own way is two sets of
 * rules about fallbacks and content types, and the audit then measures a page the end-to-end
 * suite never sees.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * @param {object} options
 * @param {string} options.dist       directory to serve
 * @param {string} [options.basePath] prefix the host mounts the app at, e.g. '/turbohamscaler/'
 * @param {number} [options.apiPort]  proxy /api and /health here; omit to serve statically only
 */
export function createStaticServer({ dist, basePath = '/', apiPort }) {
  const base = basePath.replace(/\/?$/, '/');
  return createServer((req, res) => {
    if (apiPort && (req.url.startsWith('/api') || req.url.startsWith('/health'))) {
      const proxy = httpRequest(
        {
          host: '127.0.0.1',
          port: apiPort,
          path: req.url,
          method: req.method,
          headers: req.headers,
        },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxy.on('error', () => res.writeHead(502).end());
      req.pipe(proxy);
      return;
    }

    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(
      /^(\.\.[/\\])+/,
      '',
    );
    // Serve under the same prefix the real host uses, so the audit resolves the same asset
    // URLs the deploy will rather than a set that only exists locally.
    if (base !== '/' && path.startsWith(base)) path = path.slice(base.length - 1);

    let file = join(dist, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': file.includes('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    createReadStream(file).pipe(res);
  });
}

/** Resolves once the server is accepting connections, or rejects if the port is taken. */
export function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}
