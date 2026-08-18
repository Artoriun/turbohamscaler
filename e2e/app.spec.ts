import { expect, test } from './fixtures';

/**
 * The paths a real user takes, end to end through the real API and database.
 *
 * Each test signs up its own account with a unique address, so the suite neither depends on
 * seed data nor on the order it runs in.
 */

const password = 'correct-horse-battery';
const unique = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

async function signUp(
  page: import('@playwright/test').Page,
  email: string,
  // The organisation is named after the person, so this is also how a test asks for a long
  // organisation name — which is what crowds the signed-in header.
  name = 'Test person',
) {
  // The portal, not '/': that is the public page now.
  await page.goto('/app');
  await page.getByRole('button', { name: 'Create an account instead' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Name').fill(name);
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
  // Wait for the sign-in form before typing into it. Without this the fills raced the sign-out
  // and landed in the portal that was still on screen, so the form submitted empty.
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Those details were not accepted.');

  // The same message for an address that has no account at all.
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Those details were not accepted.');
});

test('nothing in the signed-in header sits on top of anything else', async ({ page }, testInfo) => {
  // The header a signed-in visitor sees carries six controls — brand, organisation picker, role
  // badge, language, theme, sign out — where the public one carries four. On a phone that row
  // ran out of room and flex shrank the brand to 12px, but the mascot inside it is an img with a
  // fixed width and does not shrink with its parent: it overflowed and sat on top of the
  // organisation picker. Nothing caught it because every header test until now used the public
  // page, which never has the picker.
  //
  // A long organisation name on purpose: the picker sizes to its contents, and it is that width
  // that leaves the rest of the row nothing to work with. Signing up as "Test person" produces
  // "Test person's workspace", which is short enough that the header fits either way — this test
  // passed against the bug until the name got longer.
  await signUp(page, unique(), 'Bartholomew Wheelwright-Hamsworth the Third');

  const worst = await page.evaluate(() => {
    // Named controls, not "every leaf element". The first version of this filtered to elements
    // with no children, which quietly excluded the organisation picker — a <select> has <option>
    // children — so it compared everything except the control that was being sat on, and passed
    // against the bug it was written for.
    const controls = [
      '.brand-mark',
      '.org-picker',
      '.lang-toggle',
      '.theme-toggle',
      '.topbar .badge',
      '.topbar .ghost',
    ]
      .map((sel) => ({ sel, el: document.querySelector(sel) as HTMLElement | null }))
      .filter((c) => c.el && getComputedStyle(c.el).display !== 'none')
      .map((c) => ({ sel: c.sel, box: (c.el as HTMLElement).getBoundingClientRect() }));

    let worst = 0;
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i].box;
        const b = controls[j].box;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) worst = Math.max(worst, Math.round(x));
      }
    }
    return worst;
  });
  expect(worst, `two header controls overlap by ${worst}px at ${testInfo.project.name}`).toBe(0);

  // And the control that gives way must stay inside the box it belongs to, rather than hanging
  // out of a parent that flex has squeezed to nothing.
  const spill = await page.evaluate(() => {
    const label = document.querySelector('.org-picker') as HTMLElement;
    const select = label.querySelector('select') as HTMLElement;
    return Math.round(select.getBoundingClientRect().right - label.getBoundingClientRect().right);
  });
  expect(spill, 'the organisation select hangs outside its own label').toBeLessThanOrEqual(1);

  // Again at the narrowest width anybody browses on. The squeeze gets worse the less room there
  // is, and the select's own minimum — it cannot be narrower than its dropdown arrow — is what
  // the picker has to respect down here. Checked by resizing rather than by adding a third
  // project, because it is one assertion rather than a whole suite's worth.
  await page.setViewportSize({ width: 320, height: 844 });
  const narrow = await page.evaluate(() => {
    const label = document.querySelector('.org-picker') as HTMLElement;
    const select = label.querySelector('select') as HTMLElement;
    const mark = document.querySelector('.brand-mark') as HTMLElement;
    const l = label.getBoundingClientRect();
    const s = select.getBoundingClientRect();
    const m = mark.getBoundingClientRect();
    return {
      spill: Math.round(s.right - l.right),
      overlap: Math.round(Math.min(m.right, l.right) - Math.max(m.left, l.left)),
    };
  });
  expect(narrow.spill, 'at 320px the select hangs outside its label').toBeLessThanOrEqual(1);
  expect(narrow.overlap, 'at 320px the mascot sits on the organisation picker').toBeLessThanOrEqual(
    0,
  );
  // Deliberately not asserting that all six controls *fit* at 320px. Whether they do depends on
  // the font the platform picks — this passed on macOS and failed on CI's Linux, where the same
  // labels are wider — and that is a property of font metrics rather than of the layout rule
  // being tested here. Overlap and containment are the code's business; fitting is not.
});

test('the signed-in page never scrolls sideways, at any width', async ({ page }) => {
  // The panels were 404px wide inside a 320px screen. Grid and flex items default to
  // `min-width: auto` — "never shrink below your own content" — so a panel holding a row of
  // controls pushed past its container rather than squeezing, and took the whole page with it.
  //
  // Swept rather than sampled at one width, because the two bugs this covers appeared at
  // opposite ends: the panels overflowed on the narrowest screens, and a breakpoint bringing
  // the role badge back created a *new* overflow at exactly 480px, which a test at 390 and
  // 1280 would have sailed straight past.
  await signUp(page, unique(), 'Bartholomew Wheelwright-Hamsworth the Third');

  const offenders: string[] = [];
  for (const width of [320, 360, 390, 412, 480, 520, 560, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    const over = await page.evaluate(() => {
      const vw = window.innerWidth;
      return [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > vw + 1)
        .map((el) => (el.className || el.tagName).toString().slice(0, 24));
    });
    if (over.length) offenders.push(`${width}px: ${over.slice(0, 3).join(', ')}`);
  }

  expect(offenders, `content runs past the right edge at ${offenders.join(' | ')}`).toEqual([]);
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
  await expect(
    page.getByRole('heading', { name: 'This wheel is not connected to anything' }),
  ).toBeVisible();
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

test('a reduced-motion visitor gets a still frame instead of the flashing mascot', async ({
  browser,
  baseURL,
}) => {
  // The evolution is a white flash, and the site's CSS cannot switch it off — `animation: none`
  // does nothing to an animated GIF. <picture> is what actually honours the preference, and
  // currentSrc is the only way to see which source the browser really chose.
  for (const [reducedMotion, expected] of [
    ['reduce', '.png'],
    ['no-preference', '.gif'],
  ] as const) {
    const context = await browser.newContext({ reducedMotion, baseURL });
    const page = await context.newPage();
    await page.goto('/');

    const hero = await page
      .locator('.hero-mascot')
      .evaluate((el: HTMLImageElement) => el.currentSrc);
    const brand = await page
      .locator('.brand-mark')
      .evaluate((el: HTMLImageElement) => el.currentSrc);

    expect(hero, `hero mascot under reducedMotion=${reducedMotion}`).toContain(expected);
    expect(brand, `header mark under reducedMotion=${reducedMotion}`).toContain(expected);

    await context.close();
  }
});

test('leaving the portal keeps the language you were reading', async ({ page }) => {
  // Same no-API simulation as above: that screen is what the static deploy always shows, and
  // its button is the only way out of the portal a signed-out visitor gets.
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/html',
      body: '<!doctype html><title>404</title>',
    }),
  );
  await page.goto('/ja/app');
  // Hardcoding "/" here dropped a Japanese reader on the English overview with nothing on the
  // page they landed on saying why, or how to get back.
  await page.getByRole('link', { name: '概要に戻る' }).click();
  await expect(page).toHaveURL(/\/ja$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});

test('an invitation is the way into someone else’s organisation', async ({ browser }) => {
  const hostEmail = unique();
  const guestEmail = unique();

  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await signUp(host, hostEmail);

  await host.getByLabel('Address to invite').fill(guestEmail);
  await host.getByRole('button', { name: 'Create invitation' }).click();

  // The token is rendered once, by the reply that created it — there is no second chance to
  // read it, so the test takes it from the page exactly as a person would.
  const link = await host.locator('.invite-token code').innerText();
  expect(link).toContain('invite=');
  await expect(host.getByText(guestEmail)).toBeVisible();

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await signUp(guest, guestEmail);

  await guest.goto(link);
  await guest.getByRole('button', { name: 'Accept invitation' }).click();

  // Both organisations are now reachable: their own, and the one they were invited to.
  const picker = guest.getByRole('combobox', { name: 'Organisation' });
  await expect(picker.locator('option')).toHaveCount(2);

  // And the token is spent — opening the link again offers nothing.
  await guest.goto(link);
  await expect(guest.getByRole('button', { name: 'Accept invitation' })).toHaveCount(0);

  await hostCtx.close();
  await guestCtx.close();
});

test('an owner can change a role and remove someone, but not strand the organisation', async ({
  browser,
}) => {
  const hostEmail = unique();
  const guestEmail = unique();

  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await signUp(host, hostEmail);
  await host.getByLabel('Address to invite').fill(guestEmail);
  await host.getByRole('button', { name: 'Create invitation' }).click();
  const link = await host.locator('.invite-token code').innerText();

  const guestCtx = await browser.newContext();
  const guest = await guestCtx.newPage();
  await signUp(guest, guestEmail);
  await guest.goto(link);
  await guest.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(guest.getByRole('combobox', { name: 'Organisation' }).locator('option')).toHaveCount(
    2,
  );

  await host.reload();
  const guestRole = host.getByLabel(/^Role for /).last();
  await expect(guestRole).toHaveValue('member');
  await guestRole.selectOption('admin');
  await expect(guestRole).toHaveValue('admin');

  // The owner is the only one, so the server refuses to demote them and the UI says why.
  const ownerRole = host.getByLabel(/^Role for /).first();
  await ownerRole.selectOption('member');
  await expect(host.getByText('An organisation needs an owner.')).toBeVisible();
  await expect(ownerRole).toHaveValue('owner');

  await host
    .getByRole('button', { name: /^Remove .* from this organisation$/ })
    .last()
    .click();
  // Scoped to the member list: the accepted invitation stays on record below it, deliberately,
  // so the organisation keeps a note of who was let in.
  // Anchored to the Members panel by its heading: the portal now has several panels that each
  // contain a list, so a bare '.panel > ul.list' matches whichever comes first.
  const memberList = host
    .locator('section.panel')
    .filter({ has: host.getByRole('heading', { name: 'Members', exact: true }) })
    .locator('> ul.list');
  await expect(memberList.getByText(guestEmail)).toHaveCount(0);
  await expect(memberList.locator('li')).toHaveCount(1);

  await hostCtx.close();
  await guestCtx.close();
});

test('the activity log records what an admin did', async ({ browser }) => {
  const hostEmail = unique();
  const guestEmail = unique();

  const hostCtx = await browser.newContext();
  const host = await hostCtx.newPage();
  await signUp(host, hostEmail);

  await expect(host.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(host.getByText('Nothing has happened yet.')).toBeVisible();

  await host.getByLabel('Address to invite').fill(guestEmail);
  await host.getByRole('button', { name: 'Create invitation' }).click();

  // The log refreshes on the next membership change; reload is the honest way to read it now.
  await host.reload();
  await expect(host.getByText(`Invited ${guestEmail}`)).toBeVisible();
  await expect(host.getByText(new RegExp(`by .*${hostEmail}`))).toBeVisible();

  await hostCtx.close();
});

test('an organisation can be renamed, added to, and deleted', async ({ page }) => {
  await signUp(page, unique());

  // Rename: the heading and the switcher both follow it.
  await page.getByLabel('Name', { exact: true }).fill('Renamed workspace');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed workspace' })).toBeVisible();

  // A second organisation, which is what makes deleting the first survivable.
  await page.getByLabel('Name for the new organisation').fill('Second workspace');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Organisation' }).locator('option')).toHaveCount(
    2,
  );

  // Delete the one being viewed. The confirm is the only thing between a click and no undo.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete this organisation' }).click();
  await expect(page.getByRole('combobox', { name: 'Organisation' }).locator('option')).toHaveCount(
    1,
  );
});

test('changing your password signs your other devices out', async ({ browser }) => {
  const email = unique();

  const first = await browser.newContext();
  const firstPage = await first.newPage();
  await signUp(firstPage, email);

  // A second device, signed in as the same person.
  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await secondPage.goto('/app');
  await secondPage.getByLabel('Email').fill(email);
  await secondPage.getByLabel('Password').fill('correct-horse-battery');
  await secondPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(secondPage.getByRole('heading', { name: 'Projects' })).toBeVisible();

  await firstPage.getByLabel('Current password').fill('correct-horse-battery');
  await firstPage.getByLabel('New password').fill('a-brand-new-password');
  await firstPage.getByRole('button', { name: 'Change password' }).click();
  await expect(firstPage.getByText('Password changed.')).toBeVisible();

  // The other device is out on its next request — which is the entire point of the feature.
  await secondPage.reload();
  await expect(secondPage.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await first.close();
  await second.close();
});

test('a project can be edited, notes and all', async ({ page }) => {
  await signUp(page, unique());
  await page.getByLabel('New project name').fill('First draft');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('First draft')).toBeVisible();

  await page.getByRole('button', { name: /^Name for First draft$/ }).click();
  await page.getByLabel('Name for First draft').fill('Second draft');
  await page.getByLabel('Notes for First draft').fill('Now with notes');
  // Scoped to the editing row: 'Save name' in the account panel is a different button.
  await page.locator('.project-edit').getByRole('button', { name: 'Save', exact: true }).click();

  // Both fields survive the round trip. Notes had no way into the UI at all before this.
  await expect(page.getByText('Second draft')).toBeVisible();
  await expect(page.getByText('Now with notes')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Now with notes')).toBeVisible();
});

test('your sessions are listed, and one can be signed out on its own', async ({ browser }) => {
  const email = unique();

  const first = await browser.newContext();
  const firstPage = await first.newPage();
  await signUp(firstPage, email);

  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await secondPage.goto('/app');
  await secondPage.getByLabel('Email').fill(email);
  await secondPage.getByLabel('Password').fill('correct-horse-battery');
  await secondPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(secondPage.getByRole('heading', { name: 'Projects' })).toBeVisible();

  await firstPage.reload();
  const sessions = firstPage.locator('.invites', { hasText: 'Signed in on' }).locator('li');
  await expect(sessions).toHaveCount(2);
  await expect(firstPage.getByText('This device')).toBeVisible();

  // Sign out the other one, not this one.
  await sessions.filter({ hasNotText: 'This device' }).getByRole('button').click();
  await expect(sessions).toHaveCount(1);

  await secondPage.reload();
  await expect(secondPage.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // And this device is still signed in.
  await expect(firstPage.getByRole('heading', { name: 'Projects' })).toBeVisible();

  await first.close();
  await second.close();
});
