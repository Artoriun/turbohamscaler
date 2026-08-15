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
