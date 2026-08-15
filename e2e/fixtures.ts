import { test as base, expect } from '@playwright/test';

/**
 * The suite's `test`, extended so an uncaught error on the page fails the test that caused it.
 * A thrown error is the cheapest signal a browser gives that something is wrong, and without
 * this it is dropped on the floor while every assertion still passes.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: idiomatic for a valueless Playwright fixture
export const test = base.extend<{ failOnPageError: void }>({
  failOnPageError: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use();
      expect(errors, 'uncaught error(s) on the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
