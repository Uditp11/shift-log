// Every number on Summary, Time account and Payslip shows in full at phone width.
const { test, expect } = require('@playwright/test');
const { onboard, enterSeed } = require('./helpers');

// Runs in the page: tables and tile values whose content is wider than their box (cut off or scrolling).
function overflowing() {
  return [...document.querySelectorAll('.tablewrap, .tile b')]
    .filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth)
    .map((el) => (el.id || el.textContent) + ' ' + el.scrollWidth + '>' + el.clientWidth);
}

test.beforeEach(async ({ page }) => { await onboard(page); await enterSeed(page); });

test('tables and tiles fit the screen on Summary, Time account and Payslip', async ({ page }) => {
  await page.click('button[data-tab=summary]');
  await page.selectOption('#sum-period', '2026-W41');
  expect(await page.evaluate(overflowing), 'summary week').toEqual([]);
  await page.click('#sum-month');
  expect(await page.evaluate(overflowing), 'summary month').toEqual([]);
  await page.click('button[data-tab=account]');
  expect(await page.evaluate(overflowing), 'account').toEqual([]);
  await page.click('button[data-tab=payslip]');
  await page.fill('#ps-gross', '1234,56');
  await page.click('#ps-form button[type=submit]');
  await expect(page.locator('#ps-table .pill')).toHaveCount(1);
  expect(await page.evaluate(overflowing), 'payslip').toEqual([]);
});

test('tiles show the longest realistic values in full', async ({ page }) => {
  await page.click('button[data-tab=summary]');
  await page.evaluate(() => { for (const b of document.querySelectorAll('#sum-tiles .tile b')) b.textContent = '€ 9.999,99'; });
  expect(await page.evaluate(overflowing), 'summary').toEqual([]);
  await page.click('button[data-tab=account]');
  await page.evaluate(() => { for (const b of document.querySelectorAll('#acc-tiles .tile b')) b.textContent = '−123,45 h'; });
  expect(await page.evaluate(overflowing), 'account').toEqual([]);
});

test('Summary leads with gross and net, and the bonus table has three columns', async ({ page }) => {
  await page.click('button[data-tab=summary]');
  await page.selectOption('#sum-period', '2026-W41');
  const tiles = page.locator('#sum-tiles .tile');
  await expect(tiles.nth(0)).toHaveClass(/\blead\b/);
  await expect(tiles.nth(0)).toContainText('€ 545,17');
  await expect(tiles.nth(1)).toHaveClass(/\blead\b/);
  await expect(tiles.nth(1)).toContainText('€ 455,49');
  await expect(page.locator('#sum-table thead th')).toHaveCount(3);
  await page.click('button[data-tab=account]');
  await expect(page.locator('#acc-tiles .tile').first()).toHaveClass(/\bwide\b/);
});

// Beyond the 390/412 px phones: a 320 px phone, and an iPhone SE in landscape (568 px), where the
// five-column German "Earned value" table used to be too wide for the card. Tabs are switched at the
// profile's own size: after a resize to 568 × 320, WebKit's iPhone emulation reports the fixed tab bar
// as outside the viewport and won't click it.
test('tables and tiles also fit at 320 px and in 568 px landscape', async ({ page }) => {
  const own = page.viewportSize();
  for (const tab of ['summary', 'account']) {
    await page.click('button[data-tab=' + tab + ']');
    if (tab === 'summary') await page.evaluate(() => { for (const b of document.querySelectorAll('#sum-tiles .tile b')) b.textContent = '€ 9.999,99'; });
    for (const size of [{ width: 320, height: 640 }, { width: 568, height: 320 }]) {
      await page.setViewportSize(size);
      expect(await page.evaluate(overflowing), tab + ' ' + size.width).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), tab + ' page ' + size.width).toBe(true);
    }
    await page.setViewportSize(own);
  }
});
