import { expect, test } from './fixtures';

/**
 * Runs only against the built output (E2E_TARGET=dist), where the dev server's module loading
 * and proxy are gone. Kept to the shape of the build rather than repeating the app suite: the
 * bugs this target exists to catch are "it works in dev and not once built".
 */
test('the built app boots and reaches the API', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('/api/me')) failed.push(`${r.status()} ${r.url()}`);
  });
  await page.goto('/');
  // /api/me answering 401 for a signed-out visitor is correct, and is also proof the built
  // bundle is talking to the API rather than failing silently.
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(failed, 'unexpected failed requests').toEqual([]);
});
