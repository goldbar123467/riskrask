import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for running against live prod (or any remote URL).
 * Usage:
 *   # default target: https://play.upsidedownatlas.com
 *   npx playwright test --config playwright.prod.config.ts
 *   # override:
 *   PLAYWRIGHT_BASE_URL=https://staging.upsidedownatlas.com npx playwright test --config playwright.prod.config.ts
 *
 * Chromium must be installed once: `npx playwright install chromium`.
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://play.upsidedownatlas.com';

export default defineConfig({
  testDir: './e2e',
  // Solo-golden-path playtest drives a full dilettante-vs-dilettante game
  // against live prod; ~100+ turns at ~450ms/tick can burn several minutes.
  timeout: 300_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
