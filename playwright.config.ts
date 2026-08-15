import { defineConfig, devices } from '@playwright/test';

// E2E_TARGET picks what the suite runs against:
//   dev  (default) the Vite dev server proxying to a live API
//   dist the built output served statically, with the same API behind it
const TARGET = process.env.E2E_TARGET ?? 'dev';
const WEB_PORT = Number(process.env.WEB_PORT ?? (TARGET === 'dev' ? 3410 : 3462));
const API_PORT = Number(process.env.API_PORT ?? (TARGET === 'dev' ? 4410 : 4462));

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}/`,
    trace: 'retain-on-failure',
  },
  // dist.spec.ts is only meaningful against the built output, so the ordinary viewport
  // projects ignore it. A `testMatch` on a dist-only project would not be enough — the other
  // projects would still pick the file up.
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/dist.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      testIgnore: '**/dist.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'dist',
      testMatch: '**/dist.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      // A database per run, thrown away after: the suite creates accounts, and a leftover file
      // would make the second run fail on an email that already exists.
      command: `DATABASE_URL=.data/e2e-${TARGET}.db API_PORT=${API_PORT} node --disable-warning=ExperimentalWarning --import tsx packages/api/src/index.ts`,
      port: API_PORT,
      reuseExistingServer: false,
      stdout: 'ignore',
    },
    {
      command:
        TARGET === 'dev'
          ? `WEB_PORT=${WEB_PORT} API_PORT=${API_PORT} npm run dev --workspace=@hamscaler/web`
          : `node scripts/serve-dist.mjs packages/web/dist ${WEB_PORT} ${API_PORT}`,
      port: WEB_PORT,
      reuseExistingServer: false,
      stdout: 'ignore',
    },
  ],
});
