import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import path from 'node:path';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4319', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node backend/server.js',
    url: 'http://127.0.0.1:4319/health',
    reuseExistingServer: false,
    env: { NODE_ENV: 'production', PORT: '4319', HOTEL_PROVIDER: 'disabled', PROVIDER_STATE_FILE: path.join(tmpdir(), 'hotel-revealer-browser-provider-state.json') },
    timeout: 20000,
  },
});
