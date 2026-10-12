// Dev only, not deployed: screenshots of every screen in the four review profiles.
// Serve the repo first:  python3 -m http.server 4173
// Then:  npm run screens -- <out-dir> [--browser]
// Default is the installed Home Screen app (no Add to Home Screen banner, installed-app height);
// --browser shows a browser tab instead. Honours CHROMIUM_PATH like playwright.config.js.
const fs = require('fs');
const path = require('path');
const { chromium, webkit, devices } = require('@playwright/test');

const out = process.argv[2];
const asBrowser = process.argv.includes('--browser');
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const exe = process.env.CHROMIUM_PATH;
if (!out || out.startsWith('--')) { console.error('Usage: npm run screens -- <out-dir> [--browser]'); process.exit(1); }

const PROFILES = [
  { name: 'iphone-light-en', device: 'iPhone 15', scheme: 'light', locale: 'en-GB', lang: 'en' },
  { name: 'iphone-dark-de', device: 'iPhone 15', scheme: 'dark', locale: 'de-DE', lang: 'de' },
  { name: 'pixel7-light-de', device: 'Pixel 7', scheme: 'light', locale: 'de-DE', lang: 'de' },
  { name: 'pixel7-dark-en', device: 'Pixel 7', scheme: 'dark', locale: 'en-GB', lang: 'en' },
];
const SEED = [
  ['2026-10-05', 'worked', '22:00', '06:30'],
  ['2026-10-06', 'worked', '22:00', '06:30'],
  ['2026-10-07', 'dayoff'],
  ['2026-10-08', 'worked', '23:15', '06:30'],
  ['2026-10-09', 'worked', '23:30', '06:30'],
];
// Installed-app viewport: iPhone 15 is 852 pt tall, minus 59 (status bar) and 34 (home indicator).
const INSTALLED = { 'iPhone 15': { width: 393, height: 759 } };

const browsers = {};
function browserFor(dev) {
  const type = exe || dev.defaultBrowserType === 'chromium' ? 'chromium' : 'webkit';
  if (!browsers[type]) browsers[type] = (type === 'chromium' ? chromium : webkit).launch(exe ? { executablePath: exe } : {});
  return browsers[type];
}

async function run(p) {
  const dev = devices[p.device];
  const browser = await browserFor(dev);
  const viewport = !asBrowser && INSTALLED[p.device] ? INSTALLED[p.device] : dev.viewport;
  const context = await browser.newContext({ ...dev, viewport, colorScheme: p.scheme, locale: p.locale, serviceWorkers: 'block' });
  if (!asBrowser) await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }));
  const page = await context.newPage();
  // Full-page shots grow the viewport to the page height first, so the fixed tab bar lands at the bottom
  // instead of over the middle of the page.
  async function shot(name, fullPage = true) {
    const file = path.join(out, p.name + '-' + name + '.png');
    if (!fullPage) return page.screenshot({ path: file });
    const vp = page.viewportSize();
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) });
    await page.screenshot({ path: file });
    await page.setViewportSize(vp);
  }

  await page.goto(BASE);
  await page.waitForSelector('#onboarding:not([hidden])');
  await page.click('#ob-lang-' + p.lang);
  let step = 1;
  await shot('onboarding-' + step++, false);
  while (await page.locator('#ob-next').count()) {
    await page.click('#ob-next');
    await shot('onboarding-' + step++, false);
  }
  await page.click('#ob-first');
  await page.waitForSelector('#onboarding', { state: 'hidden' });

  for (const [date, status, from, till] of SEED) {
    await page.fill('#f-date', date);
    await page.selectOption('#f-status', status);
    if (from) { await page.fill('#f-from', from); await page.fill('#f-till', till); }
    await page.click('#f-save');
    const dm = date.slice(8, 10) + '.' + date.slice(5, 7) + '.';
    await page.waitForFunction((d) => document.getElementById('f-msg').textContent.includes(d), dm);
  }
  await page.fill('#f-date', '2026-10-10');
  await page.fill('#f-from', '22:00');
  await page.fill('#f-till', '06:30');
  await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
  await shot('shifts-fold', false);
  await shot('shifts');
  await page.click('button[data-tab=summary]');
  await page.selectOption('#sum-period', '2026-W41');
  await shot('summary');
  await page.click('button[data-tab=account]');
  await shot('account');
  await page.click('button[data-tab=payslip]');
  await shot('payslip');

  // Settings is a scrolling sheet: one viewport shot per screenful.
  await page.click('#open-settings');
  const sheet = page.locator('#settings');
  const { height, total } = await sheet.evaluate((el) => ({ height: el.clientHeight, total: el.scrollHeight }));
  for (let y = 0, n = 1; y < total; y += height - 80, n++) {
    await sheet.evaluate((el, top) => { el.scrollTop = top; }, y);
    await shot('settings-' + n, false);
  }
  await context.close();
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const p of PROFILES) { await run(p); console.log('saved', p.name); }
  for (const b of Object.values(browsers)) await (await b).close();
})().catch((e) => { console.error(e); process.exit(1); });
