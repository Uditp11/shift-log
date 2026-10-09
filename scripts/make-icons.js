// Renders icons/icon.svg to the PNG sizes iOS and the manifest need. Run: node scripts/make-icons.js
// CHROMIUM_PATH points at a local Chromium when Playwright's own download isn't installed.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon.svg'), 'utf8');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent('<html><body style="margin:0">' + svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ') + '</body></html>');
    await page.screenshot({ path: path.join(__dirname, '..', 'icons', 'icon-' + size + '.png'), omitBackground: false });
    await page.close();
  }
  await browser.close();
})();
