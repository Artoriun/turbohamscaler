import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Accessibility, swept with axe.
 *
 * Lighthouse already audits the public page and `/app`, but it cannot sign in — so everything
 * behind the session had never been checked, and that is most of the interface: the member list
 * with its role menus, the invitation form, the audit log, organisation settings, the account
 * panel and the inline project editor.
 *
 * The portal is filled with real content before sweeping. An empty screen passes trivially; the
 * defects live in the rows, menus and forms that only exist once there is something to show.
 */

const password = 'correct-horse-battery';
const unique = () => `a11y-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

/** Serious and critical only. Axe's lesser findings are advisory and a gate on them is noise. */
const analyse = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

async function expectNoViolations(page: Page, where: string) {
  const { violations } = await analyse(page);
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  // The message has to say which element, or a red build is a scavenger hunt.
  const detail = serious
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n      ${v.nodes.map((n) => n.target.join(' ')).join('\n      ')}`,
    )
    .join('\n    ');
  expect(serious, `${where}\n    ${detail}`).toEqual([]);
}

/** Signs up and fills the portal with the things that only exist once it is in use. */
async function populatedPortal(page: Page) {
  const email = unique();
  await page.goto('/app');
  await page.getByRole('button', { name: 'Create an account instead' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Name').fill('Sweep subject');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

  // A project, so the list and its edit controls render.
  await page.getByLabel('New project name').fill('A swept project');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('A swept project')).toBeVisible();

  // An invitation, so the outstanding list and the one-time token panel render.
  await page.getByLabel('Address to invite').fill(unique());
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.locator('.invite-token code')).toBeVisible();

  // Reload so the audit log picks up what just happened.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  return email;
}

test('the public page has no serious violations', async ({ page }) => {
  await page.goto('/');
  await expectNoViolations(page, 'the public page');
});

test('the signed-in portal has no serious violations', async ({ page }) => {
  await populatedPortal(page);
  await expectNoViolations(page, 'the portal, light');
});

test('the portal is no worse in dark mode', async ({ page }) => {
  // Contrast is the whole reason to sweep twice: the tokens differ per theme, so a pass in one
  // says nothing about the other.
  await populatedPortal(page);
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveClass(/dark-mode/);
  await expectNoViolations(page, 'the portal, dark');
});

test('the project editor has no serious violations while open', async ({ page }) => {
  // An editing row replaces the read-only one, so it is a screen axe never sees otherwise.
  await populatedPortal(page);
  await page.getByRole('button', { name: /^Name for A swept project$/ }).click();
  await expect(page.getByLabel('Notes for A swept project')).toBeVisible();
  await expectNoViolations(page, 'the portal with a project open for editing');
});

test('the sign-in screen has no serious violations', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectNoViolations(page, 'the sign-in screen');
});
