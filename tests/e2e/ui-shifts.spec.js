// The Shifts tab puts the shift's pay first.
const { test, expect } = require('@playwright/test');
const { onboard, enterSeed, asInstalledApp } = require('./helpers');

async function fillShift(page, date, from, till) {
  await page.fill('#f-date', date);
  await page.fill('#f-from', from);
  await page.fill('#f-till', till);
}

test('installed app: the shift pay is visible without scrolling, with the backup reminder showing', async ({ page }, testInfo) => {
  await asInstalledApp(page, testInfo);
  await onboard(page);
  await enterSeed(page);
  await expect(page.locator('#backup-now')).toBeVisible();
  await fillShift(page, '2026-10-10', '22:00', '06:30');
  await expect(page.locator('.pv-gross')).toHaveText('€ 172,46');
  await page.evaluate(() => { document.activeElement.blur(); window.scrollTo(0, 0); });
  const gross = await page.locator('.pv-gross').boundingBox();
  const bar = await page.locator('nav.tabs').boundingBox();
  expect(gross.y + gross.height).toBeLessThan(bar.y);
});

test('the preview shows where the money comes from', async ({ page }) => {
  await onboard(page);
  await fillShift(page, '2026-10-10', '22:00', '06:30');
  await expect(page.locator('.pv-gross')).toHaveText('€ 172,46');
  await expect(page.locator('.pv-line')).toHaveText([
    /Base · 8,00 h × € 15,33\s*€ 122,64/,
    /Night · 1,00 h\s*\+ € 3,83/,
    /Sunday · 6,00 h\s*\+ € 45,99/,
    /Bonuses\s*€ 49,82/,
  ]);
  await expect(page.locator('.pv-break')).toHaveText('break 02:00–02:30 unpaid');
});

test('the backup reminder sits under the shift form, not above it', async ({ page }) => {
  await onboard(page);
  await enterSeed(page);
  await expect(page.locator('#backup-banner #backup-now')).toBeVisible();
  await expect(page.locator('#banners #backup-now')).toHaveCount(0);
  const form = await page.locator('#shift-form').boundingBox();
  const reminder = await page.locator('#backup-banner').boundingBox();
  expect(reminder.y).toBeGreaterThanOrEqual(form.y + form.height);
  await page.click('button[data-tab=summary]');
  await expect(page.locator('#backup-now')).toBeHidden();
});

test('the This week card shows the current ISO week once a shift exists', async ({ page }) => {
  await onboard(page);
  await expect(page.locator('#week-now')).toBeHidden();
  const today = await page.evaluate(() => Fmt.todayStr());
  await fillShift(page, today, '22:00', '06:30');
  const gross = await page.locator('.pv-gross').textContent();
  await page.click('#f-save');
  const kw = await page.evaluate(() => I18n.t('common.kw', { n: Calc.isoWeek(Fmt.todayStr()).week }));
  await expect(page.locator('#week-now')).toContainText(kw);
  await expect(page.locator('#week-now')).toContainText(gross);
});

test('editing a shift with a note opens the break and note row, so nothing is hidden', async ({ page }) => {
  await onboard(page);
  await fillShift(page, '2026-10-05', '22:00', '06:30');
  await expect(page.locator('#f-more')).toHaveJSProperty('open', false);
  await expect(page.locator('#f-more-sum')).toHaveText('break 02:00–02:30 unpaid');
  await page.click('#f-more summary');
  await page.fill('#f-note', 'Gate 3');
  await expect(page.locator('#f-more-sum')).toHaveText('break 02:00–02:30 unpaid · Note');
  await page.click('#f-save');
  await expect(page.locator('#f-more')).toHaveJSProperty('open', false);
  await page.click('.row[data-date="2026-10-05"]');
  await expect(page.locator('#f-more')).toHaveJSProperty('open', true);
  await expect(page.locator('#f-note')).toBeVisible();
  await expect(page.locator('#f-note')).toHaveValue('Gate 3');
});

test('a wrong break start reopens the row, focuses the field and says what is wrong', async ({ page }) => {
  await onboard(page);
  await fillShift(page, '2026-10-05', '22:00', '06:30');
  await page.click('#f-more summary');
  await page.fill('#f-breakstart', '25:99');
  await page.click('#f-more summary');
  await expect(page.locator('#f-more')).toHaveJSProperty('open', false);
  await page.click('#f-save');
  await expect(page.locator('#f-more')).toHaveJSProperty('open', true);
  await expect(page.locator('#f-breakstart')).toBeFocused();
  const err = await page.evaluate(() => I18n.t('shifts.errBreakStart'));
  await expect(page.locator('#f-msg')).toHaveText(err);
});

// A roster "Sunday" shift that really starts Monday 01:15 is saved under Sunday with the tick-box,
// so the real Monday 22:00 shift still fits, and the after-midnight hours get no Sunday bonus.
test('a roster day shift that starts after midnight: no Sunday bonus, and the next day stays free', async ({ page }) => {
  await onboard(page);
  await fillShift(page, '2026-11-01', '01:15', '06:30');
  await expect(page.locator('.pv-hint')).toBeVisible();
  await expect(page.locator('.pv-line')).toContainText([/Sunday/]);
  await page.check('#f-am');
  await expect(page.locator('.pv-hint')).toHaveCount(0);
  await expect(page.locator('.pv-gross')).toHaveText('€ 89,11');
  await expect(page.locator('.pv-when')).toContainText('Sun 01.11. night · Mon 02.11.');
  await expect(page.locator('.pv-line', { hasText: 'Sunday' })).toHaveCount(0);
  await page.click('#f-save');
  await expect(page.locator('#f-msg')).toContainText('01.11.');
  await expect(page.locator('#f-am')).not.toBeChecked();

  await fillShift(page, '2026-11-02', '22:00', '06:30');
  await expect(page.locator('#preview .warns')).toHaveCount(0);
  await expect(page.locator('.pv-gross')).toHaveText('€ 147,55');
  await page.click('#f-save');
  await expect(page.locator('#f-msg')).toContainText('02.11.');

  const week = page.locator('#shift-list section.week').first();
  await expect(week.locator('.row')).toHaveCount(2);
  await expect(week.locator('.row .d')).toHaveText([/Mon\s*02\.11\./, /Mon\s*02\.11\./]);
  await expect(week).toContainText('roster: Sun 01.11.');

  await page.click('#shift-list .row[data-date="2026-11-01"]');
  await expect(page.locator('#f-am')).toBeChecked();
  await expect(page.locator('.pv-gross')).toHaveText('€ 89,11');
});
