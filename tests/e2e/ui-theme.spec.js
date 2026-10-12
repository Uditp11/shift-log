// Theme choice: applies at once, colours the browser bar, survives a reload.
const { test, expect } = require('@playwright/test');
const { onboard } = require('./helpers');

const metas = (page) => page.$$eval('meta[name="theme-color"]', (ms) => ms.map((m) => m.content));
const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test('Dark applies at once, colours the browser bar, survives a reload and a contract reset', async ({ page }) => {
  await onboard(page);
  await page.click('#open-settings');
  await expect(page.locator('#s-theme')).toHaveValue('system');
  await page.selectOption('#s-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await metas(page)).toEqual(['#0a0e13', '#0a0e13']);
  expect(await bodyBg(page)).toBe('rgb(10, 14, 19)');
  await page.click('#set-reset');
  await page.click('#set-reset');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await metas(page)).toEqual(['#0a0e13', '#0a0e13']);
  await page.click('#open-settings');
  await expect(page.locator('#s-theme')).toHaveValue('dark');
  await page.selectOption('#s-theme', 'system');
  expect(await page.getAttribute('html', 'data-theme')).toBeNull();
  expect(await metas(page)).toEqual(['#e9ecef', '#0a0e13']);
});

test('Light stays light, native controls included, on a phone in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await onboard(page);
  await page.click('#open-settings');
  await page.selectOption('#s-theme', 'light');
  await page.click('#set-close');
  expect(await bodyBg(page)).toBe('rgb(233, 236, 239)');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');
  expect(await page.$eval('meta[name="color-scheme"]', (m) => m.content)).toBe('light');
});
