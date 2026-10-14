const { test, expect } = require('@playwright/test');
const { onboard, enterSeed } = require('./helpers');

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

test('cancelling the share sheet does not record a backup', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'android-chrome', 'Android saves the backup as a download, there is no share sheet to cancel');
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

// Chrome on Android says canShare() yes to any file, then share() refuses a .json file with NotAllowedError
// (its share allowlist has no JSON). Mock exactly that: the backup must still be saved, as a download.
test('Android: Save backup downloads the file even though Chrome would refuse to share it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-chrome', 'Android only');
  await page.addInitScript(() => {
    window.__shareCalls = 0;
    navigator.canShare = () => true;
    navigator.share = () => { window.__shareCalls++; return Promise.reject(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })); };
  });
  await onboard(page);
  await enterSeed(page);
  // The reminder under the shift form (never backed up, 3+ shifts).
  const [first] = await Promise.all([page.waitForEvent('download'), page.click('#backup-now')]);
  expect(first.suggestedFilename()).toMatch(/^shift-log-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.locator('#f-msg')).toHaveText('Backup saved.');
  await expect(page.locator('#status')).toContainText('last backup today');
  // Settings → Save backup.
  await page.click('#open-settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#backup-btn')]);
  expect(download.suggestedFilename()).toMatch(/^shift-log-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const saved = JSON.parse(require('fs').readFileSync(await download.path(), 'utf8'));
  expect(saved.format).toBe('shift-log-backup');
  expect(saved.shifts).toHaveLength(5);
  await expect(page.locator('#backup-msg')).toHaveText('Backup saved.');
  expect(await page.evaluate(() => window.__shareCalls)).toBe(0);
});

test('iPhone: Save backup still opens the share sheet with the .json file', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'android-chrome', 'iPhone only');
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.canShare = () => true;
    navigator.share = (data) => { window.__shared.push(...data.files.map((f) => f.name + ' ' + f.type)); return Promise.resolve(); };
  });
  await onboard(page);
  await page.click('#open-settings');
  await page.click('#backup-btn');
  await expect(page.locator('#backup-msg')).toHaveText('Backup saved.');
  const shared = await page.evaluate(() => window.__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]).toMatch(/^shift-log-backup-\d{4}-\d{2}-\d{2}\.json application\/json$/);
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
