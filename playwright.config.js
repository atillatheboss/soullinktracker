// @ts-check
import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',

  /* Run tests in parallel locally */
  fullyParallel: true,

  /* Fail CI if test.only is committed */
  forbidOnly: !!process.env.CI,

  /* Retries on CI */
  retries: process.env.CI ? 2 : 0,

  /* Run sequentially in CI for stability */
  workers: process.env.CI ? 1 : undefined,

  /* HTML report */
  reporter: 'html',

  /* Global timeout per test */
  timeout: 60000,

  /* Shared settings */
  use: {
    /* Base URL for page.goto('/') */
    baseURL: 'http://localhost:3000',

    /* Run headless in CI */
    headless: true,

    /* Collect trace on retry */
    trace: 'on-first-retry',
  },

  /* Browser projects */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
      },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
      },
    },
  ],

  /* Automatically start app before tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
