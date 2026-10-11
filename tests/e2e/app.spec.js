const { test, expect } = require('@playwright/test');

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

test('seed week entered by hand reproduces the expected numbers and survives a reload', async ({ page }) => {
  await onboard(page);
  await enterSeed(page);
  await expect(page.locator('.week-head').first()).toContainText('29,25 h · € 545,17');
  await page.reload();
  await expect(page.locator('.week-head').first()).toContainText('29,25 h · € 545,17');
});

test('summary and time account match the calc tests', async ({ page }) => {
  await onboard(page);
  await enterSeed(page);
  await page.click('button[data-tab=summary]');
  await page.selectOption('#sum-period', '2026-W41');
  await expect(page.locator('#sum-tiles')).toContainText('€ 545,17');
  await expect(page.locator('#sum-tiles')).toContainText('€ 455,49');
  await page.click('button[data-tab=account]');
  await expect(page.locator('#acc-table')).toContainText('87,41');
});

test('backup → wipe → restore gives identical totals, and undo restore works', async ({ page, context }) => {
  await onboard(page);
  await enterSeed(page);
  await page.click('#open-settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#backup-btn')]);
  const file = await download.path();
  await expect(page.locator('#backup-msg')).toHaveText('Backup saved.');
  await page.click('#set-close');
  await expect(page.locator('#status')).toContainText('last backup today');
  // wipe: delete the database and reload into onboarding
  await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('shift-log'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.reload();
  await expect(page.locator('#onboarding')).toBeVisible();
  await page.click('#ob-lang-en'); await page.click('#ob-next'); await page.click('#ob-next');
  if (await page.locator('#ob-next').count()) await page.click('#ob-next');
  await page.setInputFiles('#restore-file', file);
  await expect(page.locator('#onboarding')).toBeHidden();
  await expect(page.locator('.week-head').first()).toContainText('29,25 h · € 545,17');
  // replace with an empty backup, then undo
  await page.click('#open-settings');
  const empty = { format: 'shift-log-backup', version: 1, exportedAt: new Date().toISOString(), settings: null, shifts: [], payslips: [] };
  await page.setInputFiles('#restore-file', { name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(empty)) });
  await page.click('#restore-replace');
  await expect(page.locator('#restore-msg')).toContainText('Restored 0 shifts');
  await page.click('#undo-btn');
  await expect(page.locator('#restore-msg')).toHaveText('Restore undone.');
  await page.click('#set-close');
  await expect(page.locator('.week-head').first()).toContainText('29,25 h · € 545,17');
});

test('a broken backup file is refused and nothing changes', async ({ page }) => {
  await onboard(page);
  await enterSeed(page);
  await page.click('#open-settings');
  await page.setInputFiles('#restore-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.locator('#restore-msg')).toContainText('isn’t a Shift Log backup');
  await page.click('#set-close');
  await expect(page.locator('.week-head').first()).toContainText('29,25 h · € 545,17');
});

test('cancelling the share sheet does not record a backup', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' }));
  });
  await onboard(page);
  await page.click('#open-settings');
  await page.click('#backup-btn');
  await expect(page.locator('#backup-msg')).toHaveText('Backup not saved.');
  await page.click('#set-close');
  await expect(page.locator('#status')).toContainText('No backup yet');
});

test('switching language keeps a half-filled shift form and leaves no English labels', async ({ page }) => {
  await onboard(page);
  await page.fill('#f-date', '2026-10-05');
  await page.fill('#f-from', '22:00');
  await page.click('#open-settings');
  await page.selectOption('#s-lang', 'de');
  await page.click('#set-close');
  await expect(page.locator('#f-from')).toHaveValue('22:00');
  const english = await page.evaluate(() => {
    const en = I18n.STRINGS.en, de = I18n.STRINGS.de;
    const text = document.body.innerText;
    return Object.keys(en).filter((k) => en[k] !== de[k] && en[k].length > 6 && !/\{/.test(en[k]) && text.includes(en[k]));
  });
  expect(english).toEqual([]);
});

test('works offline after the first visit', async ({ page, context }) => {
  await onboard(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#shift-form')).toBeVisible();
  await page.fill('#f-date', '2026-10-05');
  await page.fill('#f-from', '22:00');
  await page.fill('#f-till', '06:30');
  await page.click('#f-save');
  await expect(page.locator('.week-head').first()).toContainText('€ 147,55');
  await context.setOffline(false);
});

test('no horizontal scroll at phone width on any tab', async ({ page }) => {
  await onboard(page);
  await enterSeed(page);
  for (const tab of ['shifts', 'summary', 'account', 'payslip']) {
    await page.click('button[data-tab=' + tab + ']');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(page.viewportSize().width);
  }
});

test('blocked storage shows the banner and disables input', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined }); });
  await page.goto('/');
  // The phone's language decides the banner's language (German in the -de projects), so ask the app for the string.
  const noStorage = await page.evaluate(() => I18n.t('banner.noStorage'));
  expect(noStorage).not.toBe('banner.noStorage');
  await expect(page.locator('#banners')).toContainText(noStorage);
  await expect(page.locator('#f-save')).toBeDisabled();
});
