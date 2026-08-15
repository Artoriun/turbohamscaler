import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_PORT = Number(process.env.API_PORT ?? 4410);

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    port: Number(process.env.WEB_PORT ?? 3410),
    strictPort: true,
    // Same-origin in development, so the session cookie behaves exactly as it does in
    // production. Pointing the app at another origin would need SameSite=None and CSRF
    // tokens — see packages/api/src/cookies.ts.
    proxy: { '/api': `http://localhost:${API_PORT}`, '/health': `http://localhost:${API_PORT}` },
  },
  build: { outDir: 'dist', sourcemap: false },
});
