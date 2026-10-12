// Shared e2e steps. Moved out of app.spec.js so every spec file reuses them.
const { expect } = require('@playwright/test');

const SEED = [
  ['2026-10-05', 'worked', '2200', '0630', '€ 147,55'],
  ['2026-10-06', 'worked', '22:00', '06:30', '€ 147,55'],
  ['2026-10-07', 'dayoff', '', '', null],
  ['2026-10-08', 'worked', '23:15', '6:30', '€ 127,43'],
  ['2026-10-09', 'worked', '23:30', '06:30', '€ 122,64'],
];

async function onboard(page) {
  await page.goto('/');
  await expect(page.locator('#onboarding')).toBeVisible();
  await page.click('#ob-lang-en');
  await page.click('#ob-next');
  await page.click('#ob-next');
  if (await page.locator('#ob-next').count()) await page.click('#ob-next'); // Home Screen step (not standalone)
  await page.click('#ob-first');
  await expect(page.locator('#onboarding')).toBeHidden();
}

async function enterSeed(page) {
  for (const [date, status, from, till, gross] of SEED) {
    await page.fill('#f-date', date);
    await page.selectOption('#f-status', status);
    if (status === 'worked') {
      await page.fill('#f-from', from);
      await page.fill('#f-till', till);
      await expect(page.locator('.pv-gross')).toHaveText(gross);
    }
    await page.click('#f-save');
    await expect(page.locator('#f-msg')).toContainText(date.slice(8, 10) + '.' + date.slice(5, 7) + '.');
  }
}

// The Home Screen app: navigator.standalone hides the Add to Home Screen banner and
// onboarding step, and the viewport is the installed app's height. iPhone 15: 852 − 59 (status bar)
// − 34 (home indicator) = 759; Playwright's 659 models Safari with its toolbars. Pixel 7 keeps 412 × 839.
async function asInstalledApp(page, testInfo) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
  if (/^iphone/.test(testInfo.project.name)) await page.setViewportSize({ width: 393, height: 759 });
}

module.exports = { SEED, onboard, enterSeed, asInstalledApp };
