const { defineConfig, devices } = require('@playwright/test');

// Workspaces without WebKit (e.g. CI containers) can set CHROMIUM_PATH to run every project in that
// Chromium instead. CI leaves it unset, so the iPhone projects run in real WebKit there.
const chromiumPath = process.env.CHROMIUM_PATH;
const local = chromiumPath ? { browserName: 'chromium', launchOptions: { executablePath: chromiumPath } } : {};

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:4173', serviceWorkers: 'allow' },
  webServer: { command: 'python3 -m http.server 4173', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'iphone-light', use: { ...devices['iPhone 15'], colorScheme: 'light', locale: 'en-GB', ...local }, grepInvert: /offline/ },
    { name: 'iphone-dark-de', use: { ...devices['iPhone 15'], colorScheme: 'dark', locale: 'de-DE', ...local }, grepInvert: /offline/ },
    // Android Chrome runs the whole suite. Offline needs a running service worker under Playwright's
    // network emulation, which is reliable in Chromium, so the offline test runs only here.
    { name: 'android-chrome', use: { ...devices['Pixel 7'], locale: 'de-DE', ...local } },
  ],
});
