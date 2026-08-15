import { expect, test } from './fixtures';

/**
 * Runs only against the built output (E2E_TARGET=dist), where the dev server's module loading
 * and proxy are gone. Kept to the shape of the build rather than repeating the app suite: the
 * bugs this target exists to catch are "it works in dev and not once built".
 */
test('the built public page renders without a request to the API', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/')) apiCalls.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // The marketing page imports nothing from lib/api, and this is what keeps that true: a
  // visitor who never signs in should cause no traffic to the app's API at all.
  expect(apiCalls, 'the public page should not call the API').toEqual([]);
});

test('the built portal boots and reaches the API', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/api/me')) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('/app');
  // /api/me answering 401 for a signed-out visitor is correct, and is also proof the built
  // bundle is talking to the API rather than failing silently.
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(failed, 'unexpected failed requests').toEqual([]);
});

test('an unknown path still serves the app rather than a host 404', async ({ page }) => {
  // A single-page app needs the static host to fall back to index.html; without it a deep
  // link works in dev and 404s in production, which is the classic SPA deploy bug.
  const res = await page.goto('/no-such-page');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
});
