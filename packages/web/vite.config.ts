import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_PORT = Number(process.env.API_PORT ?? 4410);

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: Number(process.env.WEB_PORT ?? 3410),
    strictPort: true,
    // Dev only. Lets the server answer a tunnelled host header (Cloudflare, ngrok) so the app
    // can be opened on a phone or shared for review without editing this file each time.
    allowedHosts: true,
    // Over a tunnel the page is https on 443 while Vite listens on plain http, so the HMR
    // client has to be told where to connect back to or the console fills with failures.
    hmr: process.env.HMR_CLIENT_PORT
      ? { clientPort: Number(process.env.HMR_CLIENT_PORT), protocol: 'wss' }
      : undefined,
    // Same-origin in development, so the session cookie behaves exactly as it does in
    // production. Pointing the app at another origin would need SameSite=None and CSRF
    // tokens — see packages/api/src/cookies.ts.
    proxy: { '/api': `http://localhost:${API_PORT}`, '/health': `http://localhost:${API_PORT}` },
  },
  build: { outDir: 'dist', sourcemap: false },
});
