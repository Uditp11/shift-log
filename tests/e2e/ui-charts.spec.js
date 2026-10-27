// Time account chart on a touch screen: a tap on a day keeps its details open until the next tap
// (bug found on Android 2026-10-14: the details flashed for a split second and closed).
const { test, expect } = require('@playwright/test');
const { onboard, enterSeed } = require('./helpers');

// CI's WebKit can keep the account page from scrolling for a while after a tab switch (it treats the page
// as barely taller than the screen), so these tests make the screen tall enough to show the chart without
// scrolling, and check that all of it is in view before tapping.
async function tallScreen(page) {
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: 1100 });
}
async function expectChartOnScreen(svg) {
  await expect(svg).toBeInViewport({ ratio: 1 });
}

test('tapping a day in Balance over time keeps its details open', async ({ page }) => {
  await tallScreen(page);
  await onboard(page);
  await enterSeed(page);
  await page.click('button[data-tab=account]');
  const svg = page.locator('#chart-balance svg');
  const tip = page.locator('#chart-balance .tip');
  await expectChartOnScreen(svg);
  const box = await svg.boundingBox();

  // A day early in the chart, then wait past the old split-second flash.
  await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.waitForTimeout(600);
  await expect(tip).toBeVisible();
  const first = await tip.textContent();
  await expect(page.locator('#chart-balance .xd')).toHaveAttribute('visibility', 'visible');

  // Android Chrome's address bar slides in and out on scroll, which fires resize with the same
  // width. The chart keeps its size then, so it is not redrawn and the details stay.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(400);
  await expect(tip).toBeVisible();

  // Another day moves the details there.
  await page.touchscreen.tap(box.x + box.width * 0.95, box.y + box.height * 0.5);
  await page.waitForTimeout(600);
  await expect(tip).toBeVisible();
  expect(await tip.textContent()).not.toBe(first);

  // A tap anywhere else closes them.
  const title = await page.locator('#tab-account h3').first().boundingBox();
  await page.touchscreen.tap(title.x + 4, title.y + title.height / 2);
  await expect(tip).toBeHidden();
  await expect(page.locator('#chart-balance .xd')).toHaveAttribute('visibility', 'hidden');
});

// A real finger moves a pixel or two between down and up, so Android Chrome sends pointermove before
// pointerup and pointerleave right after it. That is the split-second flash; CDP touch events model it.
test('a finger that wiggles while tapping still keeps the details open', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'raw touch events need the Chromium DevTools protocol');
  await tallScreen(page);
  await onboard(page);
  await enterSeed(page);
  await page.click('button[data-tab=account]');
  const svg = page.locator('#chart-balance svg');
  await expectChartOnScreen(svg);
  const box = await svg.boundingBox();
  const x = box.x + box.width * 0.4, y = box.y + box.height * 0.5;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', [{ x, y }]);
  await touch('touchMove', [{ x: x + 2, y: y + 1 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(600);
  await expect(page.locator('#chart-balance .tip')).toBeVisible();
});
