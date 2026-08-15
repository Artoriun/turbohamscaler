import { expect, test } from './fixtures';

/**
 * The paths a real user takes, end to end through the real API and database.
 *
 * Each test signs up its own account with a unique address, so the suite neither depends on
 * seed data nor on the order it runs in.
 */

const password = 'correct-horse-battery';
const unique = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function signUp(page: import('@playwright/test').Page, email: string) {
  // The portal, not '/': that is the public page now.
  await page.goto('/app');
  await page.getByRole('button', { name: 'Create an account instead' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Name').fill('Test person');
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
}

test('a new account gets an organisation and can add a project', async ({ page }) => {
  await signUp(page, unique());
  // Sign-up creates the organisation, so the switcher is populated before anything is added.
  await expect(page.getByRole('combobox', { name: 'Organisation' })).toBeVisible();
  await expect(page.getByText('No projects yet.')).toBeVisible();

  await page.getByLabel('New project name').fill('First project');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('First project')).toBeVisible();
});

test('the session survives a reload and ends on sign out', async ({ page }) => {
  await signUp(page, unique());
  await page.getByLabel('New project name').fill('Persisted');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Persisted')).toBeVisible();

  await page.reload();
  // The cookie is httpOnly, so this is the only way to prove the session works at all.
  await expect(page.getByText('Persisted')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test("one account cannot see another account's projects", async ({ browser }) => {
  // The isolation suite proves this at the API. This proves the app in front of it does not
  // undo the guarantee — a cache or a shared store that outlives a sign-out would.
  const first = await browser.newContext();
  const firstPage = await first.newPage();
  await signUp(firstPage, unique());
  await firstPage.getByLabel('New project name').fill('Confidential');
  await firstPage.getByRole('button', { name: 'Add' }).click();
  await expect(firstPage.getByText('Confidential')).toBeVisible();

  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await signUp(secondPage, unique());
  await expect(secondPage.getByText('No projects yet.')).toBeVisible();
  await expect(secondPage.getByText('Confidential')).toHaveCount(0);

  await first.close();
  await second.close();
});

test('wrong credentials are refused without saying which part was wrong', async ({ page }) => {
  const email = unique();
  await signUp(page, email);
  await page.getByRole('button', { name: 'Sign out' }).click();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Those details were not accepted.');

  // The same message for an address that has no account at all.
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Those details were not accepted.');
});

test('the header stays one row and the page never scrolls sideways', async ({ page }, testInfo) => {
  // Both faults were only visible on a phone: the header wrapped the call to action onto a
  // second row and doubled its own height, which is the first thing anyone sees.
  await page.goto('/');
  const { header, overflows } = await page.evaluate(() => {
    const bar = document.querySelector('.topbar-inner') as HTMLElement;
    const doc = document.documentElement;
    return {
      header: bar.getBoundingClientRect().height,
      overflows: doc.scrollWidth > doc.clientWidth + 1,
    };
  });
  expect(overflows, `page scrolls sideways at ${testInfo.project.name}`).toBe(false);
  expect(header, 'header wrapped to a second row').toBeLessThanOrEqual(64);
});

test('the theme toggle switches, persists, and does not flash on reload', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');

  // Light by default, same as TurboHamstarter — not the operating system's preference.
  await expect(root).not.toHaveClass(/dark-mode/);

  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(root).toHaveClass(/dark-mode/);

  await page.reload();
  // Present in the very first paint, not applied by React afterwards — otherwise the visitor
  // sees light for a frame on every load. The inline script in index.html is what does it.
  await expect(root).toHaveClass(/dark-mode/);

  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(root).not.toHaveClass(/dark-mode/);
});

test('served without an API, the portal says so instead of offering a broken form', async ({
  page,
}) => {
  // What the GitHub Pages deploy is: static files, no server. A static host answers an
  // unknown path with its own 404, which is what this simulates.
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/html',
      body: '<!doctype html><title>404</title>',
    }),
  );
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'No API behind this copy' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
});

test('Japanese lives at its own path, and the switcher navigates there', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await page.getByRole('button', { name: /JA/ }).click();
  // A navigation, not a state change: the language has to be in the URL or the page cannot be
  // linked to, shared or reloaded in the language you are reading.
  await expect(page).toHaveURL(/\/ja$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('マルチテナント');

  // Deep links work directly, without going through the switcher.
  await page.goto('/ja/app');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('heading', { name: 'サインイン' })).toBeVisible();

  await page.getByRole('button', { name: /EN/ }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
