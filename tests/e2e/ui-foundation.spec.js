// Every control at least 44 × 44 px, and no input text under 16 px (iOS zooms into it).
const { test, expect } = require('@playwright/test');
const { onboard, enterSeed } = require('./helpers');

const TABS = ['shifts', 'summary', 'account', 'payslip'];

// Runs in the page. Hidden elements (closed tab, closed sheet, closed <details>) have no box and are skipped.
function smallTargets(scope) {
  const out = [];
  const box = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null; };
  const name = (el) => el.id || el.className || el.tagName;
  const root = document.querySelector(scope);
  for (const el of root.querySelectorAll('button, select, input:not([type=checkbox]), .chip')) {
    const r = box(el);
    if (r && (r.width < 44 || r.height < 44)) out.push(name(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
  }
  for (const el of root.querySelectorAll('label.check')) {
    const r = box(el);
    if (r && r.height < 44) out.push('label.check ' + Math.round(r.height));
  }
  return out;
}
function smallText(scope) {
  return [...document.querySelector(scope).querySelectorAll('input, select, textarea')]
    .filter((el) => el.type !== 'checkbox' && el.getBoundingClientRect().width > 0)
    .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
    .map((el) => (el.id || el.className || el.tagName) + ' ' + getComputedStyle(el).fontSize);
}

test.describe('controls', () => {
  test.beforeEach(async ({ page }) => { await onboard(page); await enterSeed(page); });

  test('every control is at least 44 × 44 px on each tab and in Settings', async ({ page }) => {
    for (const tab of TABS) {
      await page.click('button[data-tab=' + tab + ']');
      expect(await page.evaluate(smallTargets, 'body'), tab).toEqual([]);
    }
    await page.click('#open-settings');
    expect(await page.evaluate(smallTargets, '#settings'), 'settings').toEqual([]);
  });

  test('inputs, selects and text areas use at least 16 px text', async ({ page }) => {
    for (const tab of TABS) {
      await page.click('button[data-tab=' + tab + ']');
      expect(await page.evaluate(smallText, 'body'), tab).toEqual([]);
    }
    await page.click('#open-settings');
    expect(await page.evaluate(smallText, '#settings'), 'settings').toEqual([]);
  });
});
