# Shift Log App (friends' version) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement your task(s) from this plan (one thread = one task, see the wave table). Steps use checkbox (`- [ ]`) syntax for tracking. Read `AGENTS.md` in the repo before you start.

**Goal:** A home-screen web app on GitHub Pages where each coworker tracks their own Adecco/Deutsche Post shifts, pay, time account and payslip check, with all data stored on their own iPhone and a backup file for safety.

**Architecture:** Plain HTML/CSS/JS, no framework, no build step. Every source file in `src/` is a classic script with the same UMD wrapper as `calc.js` (a global in the browser, `module.exports` in Node), loaded in order by `index.html`. Data lives in IndexedDB (`src/store.js`); backups are versioned JSON files shared via the iOS share sheet; a service worker makes it work offline. GitHub Actions runs the tests and deploys to Pages.

**Tech Stack:** Vanilla JS (ES2020), IndexedDB, Service Worker, Web Share API; Node 22 `node --test`; `fake-indexeddb` for storage tests; Playwright (WebKit, iPhone 15 profile) for end-to-end tests; GitHub Actions + GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-09-shift-log-app-design.md` (read it with this plan).

**Reference sources** (the published Claude artifact this app is ported from; copied into the repo in Task 1): `reference/artifact-app.js`, `reference/artifact-app.src.html`, plus `src/calc.js` and `tests/calc.test.js`.

## Global Constraints

- `src/calc.js` and `tests/calc.test.js` are byte-for-byte copies of `Adecco_job/shift-log/`. Never edit `calc.js` without a failing test first; all 36 calc tests must stay green and every §7 number must match exactly.
- Every `src/*.js` file uses the UMD wrapper: `(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.<Global> = api; })(typeof self !== 'undefined' ? self : this, function () { 'use strict'; … });` Globals: `Calc`, `Fmt`, `I18n`, `Backup`, `Store`; `version.js` sets `self.APP_VERSION`.
- No third-party requests at run time: no CDN, no Google Fonts, no analytics. Fonts are self-hosted WOFF2 in `fonts/`.
- Money, numbers and dates use German formats in both languages (`€ 1.234,56`, `05.10.2026`, 24-hour times, `−` for negatives).
- Payroll terms stay German in English mode: Soll, Arbeitszeitkonto, Zuschlag, KW, Lagerhelfer.
- Every UI string lives in `src/i18n.js` in both `en` and `de` (the parity test enforces it).
- The UI keeps the artifact's current look (tokens, fonts, layout). **No redesign in this plan**; the UI upgrade with the taste-skill / ui-ux-pro-max skills is a separate, later plan.
- Light and dark themes both work; no horizontal scroll at 390 px.
- `navigator.share()` must be called synchronously inside the tap handler's first turn: build the file from in-memory state, no `await` before `share()` (iOS drops user activation).
- Test command: `npm test` (= `node --test "tests/*.test.js"`). E2E: `npm run e2e`.
- One task per branch (`task-<n>-<slug>`), one pull request per task. Never push to `main` directly.
- If npm is blocked in your workspace, write the code and tests, push the branch, and let the pull request's CI run them. Say so in the PR description.

## Ruling (deviation from the spec, decided here)

- Spec §3 says `index.html` loads `src/app.js` "as a module". This plan uses classic scripts with the UMD wrapper for every file instead, because `calc.js` must stay byte-identical and is UMD; mixing ES modules with it would need a build step. Cost if wrong: none for users.
- Spec §8 says navigation is network-first. This plan serves **everything cache-first** from one versioned cache, so `index.html` and the JS always come from the same version; updates arrive through the service-worker update + "Reload" banner. Cost if wrong: a new version shows up one reload later.

## Review Focus

1. **Settings saved by an older app version** (missing `lang`, `jobLabel`, `backupReminderDays`) must load with defaults filled in, not crash. Pinned by `mergeSettings` tests in Task 4.
2. **Restoring a backup that has no settings** (e.g. exported from the Claude artifact) with *Replace everything* must keep the person's current settings. Pinned by the `replaceAll` test in Task 5.
3. **Cancelling the iOS share sheet** must not record a backup date and must say "Backup not saved." Pinned by the e2e test in Task 9.
4. **Switching language with a half-filled shift form** must keep what was typed. Pinned by the e2e test in Task 9.
5. **No IndexedDB** (blocked storage) must show the "can't save data" banner and disable inputs, not a blank page. Pinned by the store test in Task 5 and the e2e test in Task 9.

## Waves (what can run at the same time)

| Wave | Tasks | Rule |
|---|---|---|
| 1 | Task 1 | alone; everything else needs it merged |
| 2 | Tasks 2, 3, 4, 5, 6 | **in parallel**, separate threads and branches; they touch different files |
| 3 | Task 7 | after all of wave 2 is merged |
| 4 | Task 8 | after Task 7 |
| 5 | Task 9 | after Task 8 |
| later | UI upgrade | separate plan (weekend), not part of this one |

## File map

| File | Created in | Responsibility |
|---|---|---|
| `package.json`, `.gitignore`, `AGENTS.md`, `README.md`, `.github/workflows/pages.yml` | 1 | tooling, rules, CI/CD |
| `src/calc.js`, `tests/calc.test.js`, `reference/*` | 1 | pay engine (copied), reference sources |
| `src/format.js`, `tests/format.test.js` | 2 | number/date/time formatting and parsing |
| `src/i18n.js`, `tests/i18n.test.js` | 3 | EN/DE strings, `t()` |
| `src/backup.js`, `tests/backup.test.js` | 4 | backup file, settings merge, reminder rule |
| `src/store.js`, `tests/store.test.js` | 5 | IndexedDB persistence |
| `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `src/version.js`, `icons/*`, `fonts/*`, `scripts/make-icons.js`, `tests/shell.test.js` | 6 | page shell, offline, install |
| `src/app.js` | 7, 8 | the UI |
| `playwright.config.js`, `tests/e2e/*.spec.js` | 9 | end-to-end tests |

---

### Task 1: Repo skeleton, calc engine and CI

**Files:**
- Create: `package.json`, `.gitignore`, `AGENTS.md`, `README.md`, `.github/workflows/pages.yml`
- Create (copy): `src/calc.js`, `tests/calc.test.js`, `reference/artifact-app.js`, `reference/artifact-app.src.html`, `docs/superpowers/specs/2026-10-09-shift-log-app-design.md`, `docs/superpowers/plans/2026-10-09-shift-log-app.md`

**Interfaces:**
- Consumes: the seed folder `Adecco_job\shift-log-app\` (Udit's computer; also uploaded to the GitHub repo by Udit if this thread can't reach his computer).
- Produces: `npm test` running `tests/*.test.js`; `window.Calc` / `require('../src/calc.js')` exactly as in the artifact.

- [ ] **Step 1: Copy the seed files into the repo**

From the seed folder copy: `reference/artifact-app.js`, `reference/artifact-app.src.html`, `reference/calc.js` → `src/calc.js`, `reference/calc.test.js` → `tests/calc.test.js`, `docs/` as is, `AGENTS.md` as is.

- [ ] **Step 2: Point the calc test at `src/`**

In `tests/calc.test.js` change line 4 from `const C = require('./calc.js');` to:

```js
const C = require('../src/calc.js');
```

This is the only change allowed to that file.

- [ ] **Step 3: Write `package.json`**

```json
{
  "name": "shift-log",
  "version": "1.0.0",
  "private": true,
  "description": "Shift and pay tracker for Adecco temp workers at Deutsche Post Obertshausen (home-screen web app)",
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "e2e": "playwright test"
  },
  "devDependencies": {
    "@fontsource/big-shoulders-display": "^5.0.0",
    "@fontsource/ibm-plex-mono": "^5.0.0",
    "@fontsource/public-sans": "^5.0.0",
    "@playwright/test": "1.47.2",
    "fake-indexeddb": "6.0.0"
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
test-results/
playwright-report/
_site/
```

- [ ] **Step 5: Run the calc tests**

Run: `npm install --no-audit --no-fund && npm test`
Expected: `# pass 36`, `# fail 0`. (If npm is blocked: `node --test "tests/*.test.js"` works without installing anything at this point.)

- [ ] **Step 6: Write the CI/CD workflow `.github/workflows/pages.yml`**

```yaml
name: Test and deploy
on:
  push:
    branches: [main]
  pull_request:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: false
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install --no-audit --no-fund
      - run: npm test
      - name: End-to-end tests (WebKit)
        if: hashFiles('playwright.config.js') != ''
        run: |
          npx playwright install --with-deps webkit chromium
          npm run e2e
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - name: Collect site files
        run: |
          mkdir _site
          for f in index.html styles.css manifest.webmanifest sw.js src icons fonts; do
            if [ -e "$f" ]; then cp -r "$f" _site/; fi
          done
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 7: Write `README.md`**

```markdown
# Shift Log

Shift and pay tracker for Adecco temp workers at Deutsche Post Obertshausen. Works offline from the iPhone Home Screen; all data stays on your phone.

## Install on iPhone
1. Open the link in **Safari**.
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. From now on open **Shift Log** from the new icon.

Deleting the icon deletes your data. Use **Settings → Save backup** now and then and keep the file in iCloud Drive.

## Develop
- `npm test`: unit tests (pay engine, formatting, language, backup, storage)
- `npm run e2e`: end-to-end tests in WebKit at iPhone size
- Every push to `main` runs the tests and deploys to GitHub Pages.
```

- [ ] **Step 8: Commit, push the branch, open the PR**

```bash
git checkout -b task-1-skeleton
git add -A
git commit -m "chore: repo skeleton, calc engine copy, CI and Pages deploy"
git push -u origin task-1-skeleton
```

PR title: `Task 1: repo skeleton, calc engine, CI`. Expected: CI `test` job green with 36 passing tests. After merge, Udit turns on **Settings → Pages → Source: GitHub Actions** in the repo once.

---

### Task 2: `format.js`, German number, money, date and time formatting

**Files:**
- Create: `src/format.js`
- Test: `tests/format.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `Fmt.r2(x)`, `Fmt.n2(x)`, `Fmt.eur(x)`, `Fmt.sEur(x)`, `Fmt.hrs(x)`, `Fmt.sHrs(x)` → strings; `Fmt.dm(ds)`, `Fmt.dmy(ds)`; `Fmt.wd(ds, lang)`, `Fmt.monthName(ym, lang)`, `Fmt.monthShort(ym, lang)` with `lang` `'en'|'de'`; `Fmt.todayStr(now?)` → `'YYYY-MM-DD'`; `Fmt.daysAgo(iso, now?)` → integer; `Fmt.normTime(s)` → `'HH:MM'|null`; `Fmt.parseNum(s)` → number | `null` (blank) | `NaN` (junk); `Fmt.numIn(v)` → input text; `Fmt.pad(n)`.

- [ ] **Step 1: Write the failing tests `tests/format.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/format.js');

test('eur: German grouping and decimal comma, € in front', () => {
  assert.equal(F.eur(1234.56), '€ 1.234,56');
  assert.equal(F.eur(147.55125), '€ 147,55');
  assert.equal(F.eur(0), '€ 0,00');
});
test('eur: negatives use a real minus; tiny negatives show as zero', () => {
  assert.equal(F.eur(-12), '−€ 12,00');
  assert.equal(F.eur(-0.001), '€ 0,00');
});
test('signed formats', () => {
  assert.equal(F.sEur(5), '+€ 5,00');
  assert.equal(F.sEur(-891.52431), '−€ 891,52');
  assert.equal(F.sEur(0), '±€ 0,00');
  assert.equal(F.sHrs(-58.155532), '−58,16 h');
  assert.equal(F.hrs(29.25), '29,25 h');
  assert.equal(F.n2(-3.5), '−3,50');
});
test('dates: dm, dmy, weekday and month names per language', () => {
  assert.equal(F.dm('2026-10-05'), '05.10.');
  assert.equal(F.dmy('2026-10-05'), '05.10.2026');
  assert.equal(F.wd('2026-10-05', 'en'), 'Mon');
  assert.equal(F.wd('2026-10-05', 'de'), 'Mo');
  assert.equal(F.wd('2026-10-11', 'de'), 'So');
  assert.equal(F.monthName('2026-10', 'en'), 'October 2026');
  assert.equal(F.monthName('2026-03', 'de'), 'März 2026');
  assert.equal(F.monthShort('2026-12', 'de'), 'Dez');
});
test('normTime: accepts 2200, 22, 6:30, 22.00; rejects 25:00 and text', () => {
  assert.equal(F.normTime('2200'), '22:00');
  assert.equal(F.normTime('22'), '22:00');
  assert.equal(F.normTime('6:30'), '06:30');
  assert.equal(F.normTime('630'), '06:30');
  assert.equal(F.normTime('22.00'), '22:00');
  assert.equal(F.normTime('24:00'), '24:00');
  assert.equal(F.normTime(''), null);
  assert.equal(F.normTime('25:00'), null);
  assert.equal(F.normTime('abc'), null);
});
test('parseNum: German and English decimals, blank is null, junk is NaN', () => {
  assert.equal(F.parseNum('1.234,56'), 1234.56);
  assert.equal(F.parseNum('87,41'), 87.41);
  assert.equal(F.parseNum('15.33'), 15.33);
  assert.equal(F.parseNum('€ 1.436,70'), 1436.7);
  assert.equal(F.parseNum('−58,16'), -58.16);
  assert.equal(F.parseNum(''), null);
  assert.ok(Number.isNaN(F.parseNum('abc')));
});
test('numIn: number to German input text', () => {
  assert.equal(F.numIn(15.33), '15,33');
  assert.equal(F.numIn(null), '');
});
test('todayStr uses the local date of the given Date', () => {
  assert.equal(F.todayStr(new Date(2026, 9, 9, 23, 59)), '2026-10-09');
});

test('daysAgo counts local calendar days, not 24-hour blocks', () => {
  const now = new Date(2026, 9, 9, 0, 30);
  assert.equal(F.daysAgo(new Date(2026, 9, 9, 0, 10).toISOString(), now), 0);
  assert.equal(F.daysAgo(new Date(2026, 9, 8, 23, 50).toISOString(), now), 1);
  assert.equal(F.daysAgo(new Date(2026, 9, 1, 12, 0).toISOString(), now), 8);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/format.test.js`
Expected: FAIL with `Cannot find module '../src/format.js'`.

- [ ] **Step 3: Write `src/format.js`**

```js
/* Display formatting: German numbers and money in both languages, 24-hour times.
 * Pure functions. Works in Node (module.exports) and the browser (window.Fmt). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Fmt = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
  const clean = (v) => (Object.is(v, -0) || v === 0 ? 0 : v);
  const sign = (v, zero) => (v > 0 ? '+' : v < 0 ? '−' : zero);

  function n2(x) { const v = clean(r2(x)); return (v < 0 ? '−' : '') + nf2.format(Math.abs(v)); }
  function eur(x) { const v = clean(r2(x)); return (v < 0 ? '−' : '') + '€ ' + nf2.format(Math.abs(v)); }
  function sEur(x) { const v = clean(r2(x)); return sign(v, '±') + '€ ' + nf2.format(Math.abs(v)); }
  function hrs(x) { return n2(x) + ' h'; }
  function sHrs(x) { const v = clean(r2(x)); return sign(v, '±') + nf2.format(Math.abs(v)) + ' h'; }

  const WD = {
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  };
  const MONTHS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  };
  const L = (lang) => (lang === 'de' ? 'de' : 'en');
  function dow(ds) { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function dm(ds) { return ds.slice(8, 10) + '.' + ds.slice(5, 7) + '.'; }
  function dmy(ds) { return dm(ds) + ds.slice(0, 4); }
  function wd(ds, lang) { return WD[L(lang)][dow(ds)]; }
  function monthName(ym, lang) { return MONTHS[L(lang)][+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
  function monthShort(ym, lang) { return MONTHS[L(lang)][+ym.slice(5, 7) - 1].slice(0, 3); }
  function todayStr(now) { const d = now || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // Whole local calendar days between an ISO timestamp and now (0 = today, 1 = yesterday).
  function daysAgo(iso, now) {
    const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
    return Math.round(day(now || new Date()) - day(new Date(iso)));
  }

  function normTime(s) {
    const t = String(s || '').trim().replace(/[.,h ]/g, ':').replace(/:+/g, ':').replace(/:$/, '');
    if (!t) return null;
    let m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
    let h, mi;
    if (m) { h = +m[1]; mi = +m[2]; }
    else if ((m = /^(\d{1,4})$/.exec(t))) {
      const d = m[1];
      if (d.length <= 2) { h = +d; mi = 0; } else { h = +d.slice(0, d.length - 2); mi = +d.slice(-2); }
    } else return null;
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
    return pad(h) + ':' + pad(mi);
  }
  function parseNum(s) {
    if (s == null) return null;
    let t = String(s).trim().replace(/\s|€/g, '');
    if (!t) return null;
    t = t.replace(/^−/, '-');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const v = Number(t);
    return isFinite(v) ? v : NaN;
  }
  function numIn(v) { return v == null || v === '' ? '' : String(v).replace('.', ','); }

  return { r2, n2, eur, sEur, hrs, sHrs, dm, dmy, wd, monthName, monthShort, todayStr, daysAgo, normTime, parseNum, numIn, pad };
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all format tests pass; calc still `36` passing.

- [ ] **Step 5: Commit and open the PR**

```bash
git checkout -b task-2-format
git add src/format.js tests/format.test.js
git commit -m "feat: German number/money/date formatting and time parsing"
git push -u origin task-2-format
```

---

### Task 3: `i18n.js`, English/German text

**Files:**
- Create: `src/i18n.js`
- Test: `tests/i18n.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `I18n.STRINGS` (`{en:{key:text}, de:{key:text}}`), `I18n.setLang(l)`, `I18n.getLang()`, `I18n.detectLang(navigator.language)` → `'en'|'de'`, `I18n.t(key, vars?)` filling `{name}` placeholders. Contains the keys Task 8 uses (onboarding, banners, backup, restore, storage, errors, the new settings sections). Task 7 adds the keys for the four tabs.

- [ ] **Step 1: Write the failing tests `tests/i18n.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/i18n.js');

const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');

test('en and de have exactly the same keys', () => {
  assert.deepEqual(Object.keys(I.STRINGS.de).sort(), Object.keys(I.STRINGS.en).sort());
});
test('no empty strings in either language', () => {
  for (const lang of ['en', 'de']) for (const [k, v] of Object.entries(I.STRINGS[lang])) assert.ok(typeof v === 'string' && v.trim(), lang + ':' + k);
});
test('placeholders match between languages', () => {
  for (const k of Object.keys(I.STRINGS.en)) assert.equal(vars(I.STRINGS.de[k]), vars(I.STRINGS.en[k]), k);
});
test('t fills variables and follows the language', () => {
  I.setLang('en');
  assert.equal(I.t('when.daysAgo', { n: 3 }), '3 days ago');
  I.setLang('de');
  assert.equal(I.t('when.daysAgo', { n: 3 }), 'vor 3 Tagen');
  assert.equal(I.getLang(), 'de');
  I.setLang('fr');
  assert.equal(I.getLang(), 'en');
});
test('unknown key returns the key itself (visible in testing, never blank)', () => {
  assert.equal(I.t('no.such.key'), 'no.such.key');
});
test('detectLang: German phones get de, everything else en', () => {
  assert.equal(I.detectLang('de-DE'), 'de');
  assert.equal(I.detectLang('de'), 'de');
  assert.equal(I.detectLang('en-GB'), 'en');
  assert.equal(I.detectLang(undefined), 'en');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/i18n.test.js`
Expected: FAIL with `Cannot find module '../src/i18n.js'`.

- [ ] **Step 3: Write `src/i18n.js`**

```js
/* UI text in English and German. Payroll terms (Soll, Arbeitszeitkonto, Zuschlag, KW) stay German in both.
 * Works in Node (module.exports) and the browser (window.I18n). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.I18n = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const STRINGS = {
    en: {
      'app.name': 'Shift Log',
      'common.next': 'Next',
      'common.back': 'Back',
      'common.close': 'Close',
      'status.saved': 'Saved on this iPhone',
      'status.lastBackup': 'last backup {when}',
      'status.noBackup': 'No backup yet',
      'when.today': 'today',
      'when.yesterday': 'yesterday',
      'when.daysAgo': '{n} days ago',
      'field.assignmentStart': 'Assignment start',
      'field.assignmentEnd': 'Assignment end',
      'field.weeklyHours': 'Regular hours per week',
      'ob.lang.title': 'Language',
      'ob.contract.title': 'Your contract',
      'ob.contract.body': 'Pre-filled for Adecco at Deutsche Post Obertshausen (GVP EG1: € 15,33/h, from 01.04.2027 € 15,87/h; night 25 %, Sunday 50 %, holiday 100 %). Check your dates and hours. Everything else can be changed later in Settings.',
      'ob.home.title': 'Add to Home Screen',
      'ob.home.steps': 'In Safari, tap the Share button, then “Add to Home Screen”, then “Add”. Open Shift Log from the new icon from now on.',
      'ob.home.why': 'Safari can delete a website’s data after 7 days without use. The Home Screen app keeps it.',
      'ob.data.warning': 'Your shifts are stored only on this iPhone. Deleting the app icon deletes them. Save a backup to iCloud Drive now and then.',
      'ob.firstShift': 'Add my first shift',
      'ob.restore': 'Restore from a backup',
      'banner.safari': 'You opened Shift Log in Safari. Add it to your Home Screen so your data is kept.',
      'banner.backupDue': 'Last backup {when}. Save one now so a lost phone doesn’t lose your shifts.',
      'banner.neverBackedUp': 'You haven’t saved a backup yet. Save one to iCloud Drive so a lost phone doesn’t lose your shifts.',
      'banner.update': 'A new version of Shift Log is ready.',
      'banner.reload': 'Reload',
      'banner.noStorage': 'This browser can’t save data. Open Shift Log from your Home Screen icon (not a private tab).',
      'backup.save': 'Save backup',
      'backup.saved': 'Backup saved.',
      'backup.cancelled': 'Backup not saved.',
      'backup.failed': 'Couldn’t create the backup file. Try again.',
      'restore.pick': 'Restore from backup',
      'restore.preview': '{shifts} shifts, {payslips} payslips, {first} – {last}, saved {saved}',
      'restore.replace': 'Replace everything',
      'restore.merge': 'Add missing entries only',
      'restore.done': 'Restored {shifts} shifts and {payslips} payslips.',
      'restore.undo': 'Undo restore',
      'restore.undone': 'Restore undone.',
      'restore.err.bad-json': 'This file isn’t a Shift Log backup (it can’t be read as JSON). Nothing was changed.',
      'restore.err.wrong-format': 'This file isn’t a Shift Log backup. Nothing was changed.',
      'restore.err.newer-version': 'This backup comes from a newer Shift Log. Open the app while online so it updates, then try again.',
      'restore.err.bad-record': 'The backup has a broken entry ({detail}). Nothing was changed.',
      'storage.persisted': 'Kept permanently',
      'storage.notPersisted': 'May be cleared by iOS',
      'storage.unknown': 'Unknown',
      'storage.counts': '{shifts} shifts · {payslips} payslips',
      'err.saveFull': 'Couldn’t save on this iPhone: storage is full. Save a backup, then free up space.',
      'err.save': 'Couldn’t save on this iPhone. Try again.',
      'settings.language': 'Language',
      'settings.jobLabel': 'Job label (shown under the title)',
      'settings.backup': 'Backup & restore',
      'settings.reminderDays': 'Remind me to back up after (days)',
      'settings.storage': 'Storage',
      'settings.about': 'About',
      'settings.version': 'Version {v}',
    },
    de: {
      'app.name': 'Shift Log',
      'common.next': 'Weiter',
      'common.back': 'Zurück',
      'common.close': 'Schließen',
      'status.saved': 'Auf diesem iPhone gespeichert',
      'status.lastBackup': 'letzte Sicherung {when}',
      'status.noBackup': 'Noch keine Sicherung',
      'when.today': 'heute',
      'when.yesterday': 'gestern',
      'when.daysAgo': 'vor {n} Tagen',
      'field.assignmentStart': 'Einsatzbeginn',
      'field.assignmentEnd': 'Einsatzende',
      'field.weeklyHours': 'Regelmäßige Wochenstunden',
      'ob.lang.title': 'Sprache',
      'ob.contract.title': 'Dein Vertrag',
      'ob.contract.body': 'Vorausgefüllt für Adecco bei der Deutschen Post Obertshausen (GVP EG1: 15,33 €/h, ab 01.04.2027 15,87 €/h; Nacht 25 %, Sonntag 50 %, Feiertag 100 %). Prüfe deine Daten und Stunden. Alles andere kannst du später in den Einstellungen ändern.',
      'ob.home.title': 'Zum Home-Bildschirm',
      'ob.home.steps': 'Tippe in Safari auf „Teilen“, dann auf „Zum Home-Bildschirm“ und auf „Hinzufügen“. Öffne Shift Log ab jetzt über das neue Symbol.',
      'ob.home.why': 'Safari kann die Daten einer Website nach 7 Tagen ohne Nutzung löschen. Die App auf dem Home-Bildschirm behält sie.',
      'ob.data.warning': 'Deine Schichten sind nur auf diesem iPhone gespeichert. Wenn du das App-Symbol löschst, sind sie weg. Speichere ab und zu eine Sicherung in iCloud Drive.',
      'ob.firstShift': 'Erste Schicht eintragen',
      'ob.restore': 'Aus Sicherung wiederherstellen',
      'banner.safari': 'Du hast Shift Log in Safari geöffnet. Lege es auf den Home-Bildschirm, damit deine Daten erhalten bleiben.',
      'banner.backupDue': 'Letzte Sicherung {when}. Speichere jetzt eine, damit ein verlorenes Handy deine Schichten nicht mitnimmt.',
      'banner.neverBackedUp': 'Du hast noch keine Sicherung gespeichert. Speichere eine in iCloud Drive, damit ein verlorenes Handy deine Schichten nicht mitnimmt.',
      'banner.update': 'Eine neue Version von Shift Log ist bereit.',
      'banner.reload': 'Neu laden',
      'banner.noStorage': 'Dieser Browser kann keine Daten speichern. Öffne Shift Log über das Symbol auf dem Home-Bildschirm (nicht im privaten Tab).',
      'backup.save': 'Sicherung speichern',
      'backup.saved': 'Sicherung gespeichert.',
      'backup.cancelled': 'Sicherung nicht gespeichert.',
      'backup.failed': 'Die Sicherungsdatei konnte nicht erstellt werden. Versuch es noch einmal.',
      'restore.pick': 'Aus Sicherung wiederherstellen',
      'restore.preview': '{shifts} Schichten, {payslips} Abrechnungen, {first} – {last}, gespeichert am {saved}',
      'restore.replace': 'Alles ersetzen',
      'restore.merge': 'Nur fehlende Einträge hinzufügen',
      'restore.done': '{shifts} Schichten und {payslips} Abrechnungen wiederhergestellt.',
      'restore.undo': 'Wiederherstellung rückgängig machen',
      'restore.undone': 'Wiederherstellung rückgängig gemacht.',
      'restore.err.bad-json': 'Diese Datei ist keine Shift-Log-Sicherung (sie lässt sich nicht als JSON lesen). Es wurde nichts geändert.',
      'restore.err.wrong-format': 'Diese Datei ist keine Shift-Log-Sicherung. Es wurde nichts geändert.',
      'restore.err.newer-version': 'Diese Sicherung stammt aus einer neueren Shift-Log-Version. Öffne die App mit Internet, damit sie sich aktualisiert, und versuch es dann noch einmal.',
      'restore.err.bad-record': 'Die Sicherung enthält einen fehlerhaften Eintrag ({detail}). Es wurde nichts geändert.',
      'storage.persisted': 'Dauerhaft gespeichert',
      'storage.notPersisted': 'Kann von iOS gelöscht werden',
      'storage.unknown': 'Unbekannt',
      'storage.counts': '{shifts} Schichten · {payslips} Abrechnungen',
      'err.saveFull': 'Speichern auf diesem iPhone nicht möglich: Der Speicher ist voll. Speichere eine Sicherung und schaffe dann Platz.',
      'err.save': 'Speichern auf diesem iPhone nicht möglich. Versuch es noch einmal.',
      'settings.language': 'Sprache',
      'settings.jobLabel': 'Job-Bezeichnung (unter dem Titel)',
      'settings.backup': 'Sicherung & Wiederherstellung',
      'settings.reminderDays': 'An Sicherung erinnern nach (Tagen)',
      'settings.storage': 'Speicher',
      'settings.about': 'Über',
      'settings.version': 'Version {v}',
    },
  };
  let lang = 'en';
  function setLang(l) { lang = STRINGS[l] ? l : 'en'; }
  function getLang() { return lang; }
  function detectLang(navLang) { return /^de\b/i.test(navLang || '') ? 'de' : 'en'; }
  function t(key, vars) {
    const s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
  }
  return { STRINGS, setLang, getLang, detectLang, t };
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all i18n tests pass.

- [ ] **Step 5: Commit and open the PR**

```bash
git checkout -b task-3-i18n
git add src/i18n.js tests/i18n.test.js
git commit -m "feat: English/German strings with parity tests"
git push -u origin task-3-i18n
```

---

### Task 4: `backup.js`, backup files, settings merge, reminder rule

**Files:**
- Create: `src/backup.js`
- Test: `tests/backup.test.js`

**Interfaces:**
- Consumes: nothing at run time (tests use `src/calc.js` for realistic settings).
- Produces:
  - `Backup.buildBackup(data, now: Date, appVersion: string)` → `{format:'shift-log-backup', version:1, exportedAt, appVersion, settings|null, shifts:[…sorted by date], payslips:[…sorted by month]}`; `data` is `{shifts:{date:doc}, payslips:{month:doc}, settings:obj|null}`.
  - `Backup.backupFileName(now)` → `'shift-log-backup-YYYY-MM-DD.json'` (local date).
  - `Backup.parseBackup(text)` → `{ok:true, data:{shifts, payslips, settings|null}, summary:{shifts, payslips, first, last, exportedAt}}` or `{ok:false, code:'bad-json'|'wrong-format'|'newer-version'|'bad-record', detail}`.
  - `Backup.mergeMissing(current, incoming)` → data (adds absent shifts/payslips only, keeps `current.settings`).
  - `Backup.appDefaults(calcDefaults, lang)` → calc defaults + `{lang, jobLabel, backupReminderDays: 7}`.
  - `Backup.mergeSettings(doc|null, defaults)` → full settings object.
  - `Backup.backupDue(meta, settings, shiftCount, now)` → `false | {never: boolean}`.

- [ ] **Step 1: Write the failing tests `tests/backup.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/backup.js');
const C = require('../src/calc.js');

const sh = (date, from, till, status = 'worked') => ({ date, from, till, breakMin: 30, breakStart: null, status, note: '' });
const DATA = {
  shifts: { '2026-10-05': sh('2026-10-05', '22:00', '06:30'), '2026-10-07': sh('2026-10-07', '', '', 'dayoff') },
  payslips: { '2026-10': { month: '2026-10', grossTotal: 1436.7, netTotal: 1168.71, hoursPaid: 87.41, premiumsPaid: null, timeAccountBalance: null, note: '' } },
  settings: { ...C.defaultSettings(), lang: 'de' },
};
const NOW = new Date('2026-10-09T18:30:00.000Z');

test('build → parse round trip returns identical data and a summary', () => {
  const file = B.buildBackup(DATA, NOW, '1.0.0');
  assert.equal(file.format, 'shift-log-backup');
  assert.equal(file.version, 1);
  assert.equal(file.exportedAt, '2026-10-09T18:30:00.000Z');
  assert.deepEqual(file.shifts.map((s) => s.date), ['2026-10-05', '2026-10-07']);
  const r = B.parseBackup(JSON.stringify(file));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, DATA);
  assert.deepEqual(r.summary, { shifts: 2, payslips: 1, first: '2026-10-05', last: '2026-10-07', exportedAt: '2026-10-09T18:30:00.000Z' });
});
test('refuses text that is not JSON', () => {
  assert.deepEqual(B.parseBackup('not json {'), { ok: false, code: 'bad-json', detail: '' });
});
test('refuses JSON that is not a Shift Log backup', () => {
  assert.equal(B.parseBackup('{"hello":1}').code, 'wrong-format');
  assert.equal(B.parseBackup('[1,2]').code, 'wrong-format');
  assert.equal(B.parseBackup('null').code, 'wrong-format');
});
test('refuses a backup from a newer version', () => {
  const file = { ...B.buildBackup(DATA, NOW, '9.0.0'), version: 2 };
  assert.equal(B.parseBackup(JSON.stringify(file)).code, 'newer-version');
});
test('refuses a broken shift and names it', () => {
  const file = B.buildBackup(DATA, NOW, '1.0.0');
  file.shifts[0].till = '25:00';
  const r = B.parseBackup(JSON.stringify(file));
  assert.equal(r.code, 'bad-record');
  assert.match(r.detail, /2026-10-05/);
});
test('refuses a broken payslip month', () => {
  const file = B.buildBackup(DATA, NOW, '1.0.0');
  file.payslips[0].month = 'Oct';
  assert.equal(B.parseBackup(JSON.stringify(file)).code, 'bad-record');
});
test('accepts the Claude artifact shapes: {id, data} rows and objects keyed by id', () => {
  const rows = {
    format: 'shift-log-backup', version: 1, exportedAt: NOW.toISOString(), settings: null,
    shifts: [{ id: '2026-10-05', data: { from: '22:00', till: '06:30', breakMin: 30, breakStart: null, status: 'worked', note: '' }, version: 1 }],
    payslips: { '2026-10': { grossTotal: 1, netTotal: 1, hoursPaid: null, premiumsPaid: null, timeAccountBalance: null, note: '' } },
  };
  const r = B.parseBackup(JSON.stringify(rows));
  assert.equal(r.ok, true);
  assert.equal(r.data.shifts['2026-10-05'].date, '2026-10-05');
  assert.equal(r.data.payslips['2026-10'].month, '2026-10');
  assert.equal(r.data.settings, null);
});
test('mergeMissing adds only absent shifts/payslips and keeps current settings', () => {
  const current = { shifts: { '2026-10-05': sh('2026-10-05', '23:00', '06:30') }, payslips: {}, settings: { a: 1 } };
  const incoming = { shifts: { '2026-10-05': sh('2026-10-05', '22:00', '06:30'), '2026-10-06': sh('2026-10-06', '22:00', '06:30') }, payslips: { '2026-10': DATA.payslips['2026-10'] }, settings: { a: 2 } };
  const m = B.mergeMissing(current, incoming);
  assert.equal(m.shifts['2026-10-05'].from, '23:00');
  assert.ok(m.shifts['2026-10-06']);
  assert.ok(m.payslips['2026-10']);
  assert.deepEqual(m.settings, { a: 1 });
});
test('backupFileName uses the local date', () => {
  assert.equal(B.backupFileName(new Date(2026, 9, 9, 23, 50)), 'shift-log-backup-2026-10-09.json');
});
test('mergeSettings: settings saved by an older version get the new keys from defaults', () => {
  const defaults = B.appDefaults(C.defaultSettings(), 'de');
  const old = { ...C.defaultSettings(), nightPct: 30 };
  const s = B.mergeSettings(old, defaults);
  assert.equal(s.nightPct, 30);
  assert.equal(s.lang, 'de');
  assert.equal(s.backupReminderDays, 7);
  assert.equal(s.jobLabel, 'Lagerhelfer · Deutsche Post Obertshausen · via Adecco');
});
test('mergeSettings keeps absenceCreditH, repairs empty ratePeriods and a missing override map', () => {
  const defaults = B.appDefaults(C.defaultSettings(), 'en');
  const s = B.mergeSettings({ absenceCreditH: 5, ratePeriods: [], monthTargetOverride: null, junk: 1 }, defaults);
  assert.equal(s.absenceCreditH, 5);
  assert.equal(s.ratePeriods.length, 2);
  assert.deepEqual(s.monthTargetOverride, {});
  assert.equal('junk' in s, false);
  assert.equal(B.mergeSettings(null, defaults).lang, 'en');
});

const D = 86400000;
const meta = (lastBackupAt, lastChangeAt) => ({ lastBackupAt, lastChangeAt });
test('backupDue: never backed up → due once there are 3 shifts', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  assert.equal(B.backupDue(meta(null, now.toISOString()), { backupReminderDays: 7 }, 2, now), false);
  assert.deepEqual(B.backupDue(meta(null, now.toISOString()), { backupReminderDays: 7 }, 3, now), { never: true });
  assert.equal(B.backupDue(meta(null, null), { backupReminderDays: 7 }, 0, now), false);
});
test('backupDue: due only when there were changes since the last backup and it is older than the reminder days', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const old = new Date(now - 8 * D).toISOString(), recent = new Date(now - 2 * D).toISOString(), changed = new Date(now - 1 * D).toISOString();
  assert.deepEqual(B.backupDue(meta(old, changed), { backupReminderDays: 7 }, 10, now), { never: false });
  assert.equal(B.backupDue(meta(recent, changed), { backupReminderDays: 7 }, 10, now), false);
  assert.equal(B.backupDue(meta(old, new Date(now - 9 * D).toISOString()), { backupReminderDays: 7 }, 10, now), false);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/backup.test.js`
Expected: FAIL with `Cannot find module '../src/backup.js'`.

- [ ] **Step 3: Write `src/backup.js`**

```js
/* Backup files and settings normalisation. Pure functions, no browser APIs.
 * Works in Node (module.exports) and the browser (window.Backup). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Backup = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FORMAT = 'shift-log-backup';
  const VERSION = 1;
  const STATUSES = ['worked', 'dayoff', 'sick', 'vacation'];
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const MONTH = /^\d{4}-\d{2}$/;
  const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;
  const PAYSLIP_NUMS = ['grossTotal', 'netTotal', 'hoursPaid', 'premiumsPaid', 'timeAccountBalance'];
  const pad = (n) => String(n).padStart(2, '0');
  const clone = (x) => JSON.parse(JSON.stringify(x));

  function sortedValues(map, key) {
    return Object.values(map || {}).slice().sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0));
  }

  function buildBackup(data, now, appVersion) {
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: now.toISOString(),
      appVersion: appVersion || '',
      settings: data.settings ? clone(data.settings) : null,
      shifts: clone(sortedValues(data.shifts, 'date')),
      payslips: clone(sortedValues(data.payslips, 'month')),
    };
  }

  function backupFileName(now) {
    return 'shift-log-backup-' + now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + '.json';
  }

  // Accepts an array of records, an array of {id, data} rows, or an object keyed by id.
  function normalizeList(list, key) {
    if (list == null) return [];
    const fix = (rec, id) => {
      const body = rec && typeof rec === 'object' && rec.data && typeof rec.data === 'object' && !Array.isArray(rec.data) ? rec.data : rec;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      const out = clone(body);
      if (out[key] == null) out[key] = (rec && rec.id) || id;
      return out;
    };
    if (Array.isArray(list)) return list.map((r) => fix(r, undefined));
    if (typeof list === 'object') return Object.keys(list).map((k) => fix(list[k], k));
    return [null];
  }

  function shiftProblem(s) {
    if (!s) return 'shift: not an object';
    if (!DATE.test(String(s.date))) return 'shift date ' + JSON.stringify(s.date);
    const status = s.status == null ? 'worked' : s.status;
    if (!STATUSES.includes(status)) return 'shift ' + s.date + ': status ' + JSON.stringify(s.status);
    if (status === 'worked') {
      if (!TIME.test(String(s.from))) return 'shift ' + s.date + ': from ' + JSON.stringify(s.from);
      if (!TIME.test(String(s.till))) return 'shift ' + s.date + ': till ' + JSON.stringify(s.till);
      if (s.breakStart != null && s.breakStart !== '' && !TIME.test(String(s.breakStart))) return 'shift ' + s.date + ': breakStart ' + JSON.stringify(s.breakStart);
    }
    if (s.breakMin != null && s.breakMin !== '' && !(Number(s.breakMin) >= 0)) return 'shift ' + s.date + ': breakMin ' + JSON.stringify(s.breakMin);
    return null;
  }

  function payslipProblem(p) {
    if (!p) return 'payslip: not an object';
    if (!MONTH.test(String(p.month))) return 'payslip month ' + JSON.stringify(p.month);
    for (const k of PAYSLIP_NUMS) if (p[k] != null && typeof p[k] !== 'number') return 'payslip ' + p.month + ': ' + k + ' ' + JSON.stringify(p[k]);
    return null;
  }

  function parseBackup(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { ok: false, code: 'bad-json', detail: '' }; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.format !== FORMAT) return { ok: false, code: 'wrong-format', detail: '' };
    if (typeof obj.version !== 'number' || obj.version < 1) return { ok: false, code: 'wrong-format', detail: '' };
    if (obj.version > VERSION) return { ok: false, code: 'newer-version', detail: String(obj.version) };
    if (obj.settings != null && (typeof obj.settings !== 'object' || Array.isArray(obj.settings))) return { ok: false, code: 'bad-record', detail: 'settings' };
    const shifts = {}, payslips = {};
    for (const s of normalizeList(obj.shifts, 'date')) {
      const p = shiftProblem(s);
      if (p) return { ok: false, code: 'bad-record', detail: p };
      if (s.status == null) s.status = 'worked';
      shifts[s.date] = s;
    }
    for (const ps of normalizeList(obj.payslips, 'month')) {
      const p = payslipProblem(ps);
      if (p) return { ok: false, code: 'bad-record', detail: p };
      payslips[ps.month] = ps;
    }
    const dates = Object.keys(shifts).sort();
    return {
      ok: true,
      data: { shifts, payslips, settings: obj.settings ? clone(obj.settings) : null },
      summary: {
        shifts: dates.length, payslips: Object.keys(payslips).length,
        first: dates[0] || null, last: dates[dates.length - 1] || null, exportedAt: obj.exportedAt || null,
      },
    };
  }

  function mergeMissing(current, incoming) {
    return {
      shifts: { ...clone(incoming.shifts || {}), ...clone(current.shifts || {}) },
      payslips: { ...clone(incoming.payslips || {}), ...clone(current.payslips || {}) },
      settings: current.settings ? clone(current.settings) : null,
    };
  }

  // App-level defaults = the calc engine's contract defaults + the app's own keys.
  function appDefaults(calcDefaults, lang) {
    return {
      ...clone(calcDefaults),
      lang: lang === 'de' ? 'de' : 'en',
      jobLabel: 'Lagerhelfer · Deutsche Post Obertshausen · via Adecco',
      backupReminderDays: 7,
    };
  }

  // Saved settings over defaults: unknown keys dropped, new keys filled, broken shapes repaired.
  function mergeSettings(doc, defaults) {
    const s = clone(defaults);
    if (doc && typeof doc === 'object') {
      const d = clone(doc);
      for (const k of Object.keys(d)) if (k in s || k === 'absenceCreditH') s[k] = d[k];
    }
    if (!s.monthTargetOverride || typeof s.monthTargetOverride !== 'object' || Array.isArray(s.monthTargetOverride)) s.monthTargetOverride = {};
    if (!Array.isArray(s.ratePeriods) || !s.ratePeriods.length) s.ratePeriods = clone(defaults.ratePeriods);
    return s;
  }

  // Reminder rule: never backed up and at least 3 shifts, or changes since the last backup and it is older than backupReminderDays.
  function backupDue(meta, settings, shiftCount, now) {
    if (!shiftCount) return false;
    if (!meta.lastBackupAt) return shiftCount >= 3 ? { never: true } : false;
    const days = Number(settings.backupReminderDays) > 0 ? Number(settings.backupReminderDays) : 7;
    const changedSince = meta.lastChangeAt && meta.lastChangeAt > meta.lastBackupAt;
    const age = now.getTime() - new Date(meta.lastBackupAt).getTime();
    return changedSince && age > days * 86400000 ? { never: false } : false;
  }

  return { backupDue, FORMAT, VERSION, buildBackup, backupFileName, parseBackup, mergeMissing, appDefaults, mergeSettings };
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all backup tests pass.

- [ ] **Step 5: Commit and open the PR**

```bash
git checkout -b task-4-backup
git add src/backup.js tests/backup.test.js
git commit -m "feat: versioned backup files, settings merge and backup reminder rule"
git push -u origin task-4-backup
```

---

### Task 5: `store.js`, IndexedDB persistence

**Files:**
- Create: `src/store.js`
- Test: `tests/store.test.js`

**Interfaces:**
- Consumes: nothing (IndexedDB is injected; tests use `fake-indexeddb`).
- Produces: `Store.openStore({indexedDB?, name?, now?, storage?})` → Promise of an API, or rejects with `err.code === 'no-idb'`. API: `getAll()` → `{shifts:{date:doc}, payslips:{month:doc}, settings|null, meta}`; `getMeta()`; `setMeta(patch)` (does not stamp `lastChangeAt`); `putShift(doc)`, `deleteShift(date)`, `putPayslip(doc)`, `deletePayslip(month)`, `putSettings(obj)`, `replaceAll(data)` (null settings = keep current) — all stamp `meta.lastChangeAt` and reject with `err.code` `'quota'|'write-failed'`; `saveUndo()`, `restoreUndo()` → boolean, `hasUndo()`; `requestPersist()` / `isPersisted()` → `true|false|null`; `close()`. Also `Store.DEFAULT_META`, `Store.DB_NAME`, `Store.DB_VERSION`.

- [ ] **Step 1: Write the failing tests `tests/store.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { indexedDB } = require('fake-indexeddb');
const S = require('../src/store.js');

let n = 0;
const NOW = new Date('2026-10-09T18:00:00.000Z');
const open = (extra) => S.openStore({ indexedDB, name: 'test-' + (++n), now: () => NOW, storage: null, ...extra });
const sh = (date, from = '22:00', till = '06:30') => ({ date, from, till, breakMin: 30, breakStart: null, status: 'worked', note: '' });

test('a new store is empty with default meta', async () => {
  const s = await open();
  const all = await s.getAll();
  assert.deepEqual(all.shifts, {});
  assert.deepEqual(all.payslips, {});
  assert.equal(all.settings, null);
  assert.deepEqual(all.meta, S.DEFAULT_META);
});
test('putShift saves the shift and stamps lastChangeAt', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  const all = await s.getAll();
  assert.deepEqual(all.shifts['2026-10-05'], sh('2026-10-05'));
  assert.equal(all.meta.lastChangeAt, '2026-10-09T18:00:00.000Z');
});
test('delete, payslips and settings round trip', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  await s.deleteShift('2026-10-05');
  await s.putPayslip({ month: '2026-10', grossTotal: 1 });
  await s.putSettings({ nightPct: 25 });
  let all = await s.getAll();
  assert.deepEqual(all.shifts, {});
  assert.equal(all.payslips['2026-10'].grossTotal, 1);
  assert.deepEqual(all.settings, { nightPct: 25 });
  await s.deletePayslip('2026-10');
  all = await s.getAll();
  assert.deepEqual(all.payslips, {});
});
test('setMeta merges and does not count as a data change', async () => {
  const s = await open();
  await s.setMeta({ onboarded: true, lastBackupAt: '2026-10-01T00:00:00.000Z' });
  const m = await s.getMeta();
  assert.equal(m.onboarded, true);
  assert.equal(m.lastBackupAt, '2026-10-01T00:00:00.000Z');
  assert.equal(m.lastChangeAt, null);
});
test('replaceAll replaces shifts and payslips; a backup without settings keeps the current settings', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  await s.putSettings({ nightPct: 30 });
  await s.replaceAll({ shifts: { '2026-10-06': sh('2026-10-06') }, payslips: {}, settings: null });
  const all = await s.getAll();
  assert.deepEqual(Object.keys(all.shifts), ['2026-10-06']);
  assert.deepEqual(all.settings, { nightPct: 30 });
});
test('saveUndo → replaceAll → restoreUndo brings back exactly the old data', async () => {
  const s = await open();
  await s.putShift(sh('2026-10-05'));
  await s.saveUndo();
  assert.equal(await s.hasUndo(), true);
  await s.replaceAll({ shifts: { '2026-10-06': sh('2026-10-06') }, payslips: { '2026-10': { month: '2026-10' } }, settings: { nightPct: 99 } });
  assert.equal(await s.restoreUndo(), true);
  const all = await s.getAll();
  assert.deepEqual(Object.keys(all.shifts), ['2026-10-05']);
  assert.deepEqual(all.payslips, {});
  assert.equal(all.settings, null);
  assert.equal(await s.hasUndo(), false);
  assert.equal(await s.restoreUndo(), false);
});
test('data survives closing and reopening the database', async () => {
  const name = 'reopen-' + (++n);
  const a = await S.openStore({ indexedDB, name, storage: null });
  await a.putShift(sh('2026-10-05'));
  a.close();
  const b = await S.openStore({ indexedDB, name, storage: null });
  assert.ok((await b.getAll()).shifts['2026-10-05']);
});
test('no IndexedDB at all rejects with code no-idb', async () => {
  await assert.rejects(S.openStore({ indexedDB: null, storage: null }), (e) => e.code === 'no-idb');
});
test('persistent storage: asks the storage manager; null when there is none', async () => {
  const yes = await open({ storage: { persist: async () => true, persisted: async () => true } });
  assert.equal(await yes.requestPersist(), true);
  assert.equal(await yes.isPersisted(), true);
  const none = await open({ storage: null });
  assert.equal(await none.requestPersist(), null);
  assert.equal(await none.isPersisted(), null);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm install --no-audit --no-fund && node --test tests/store.test.js`
Expected: FAIL with `Cannot find module '../src/store.js'`.

- [ ] **Step 3: Write `src/store.js`**

```js
/* On-device persistence (IndexedDB). Every write also stamps meta.lastChangeAt in the same transaction.
 * Works in the browser (window.Store) and in Node tests with an injected indexedDB (module.exports). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Store = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const DB_NAME = 'shift-log';
  const DB_VERSION = 1;
  const DEFAULT_META = { schemaVersion: 1, onboarded: false, lastBackupAt: null, lastChangeAt: null, persistAsked: false };

  // MIGRATIONS[v] upgrades a database from version v to v+1. Never edit a shipped entry; append a new one.
  const MIGRATIONS = [
    (db) => {
      db.createObjectStore('shifts', { keyPath: 'date' });
      db.createObjectStore('payslips', { keyPath: 'month' });
      db.createObjectStore('settings');
      db.createObjectStore('meta');
      db.createObjectStore('undo');
    },
  ];

  function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function txDone(t) {
    return new Promise((res, rej) => {
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Transaction aborted'));
    });
  }
  function storeError(e) {
    const err = new Error((e && e.message) || 'Storage error');
    err.code = e && e.name === 'QuotaExceededError' ? 'quota' : 'write-failed';
    err.cause = e;
    return err;
  }
  function noIdb(cause) { return Object.assign(new Error('IndexedDB unavailable'), { code: 'no-idb', cause }); }

  function openStore(opts) {
    opts = opts || {};
    const idb = 'indexedDB' in opts ? opts.indexedDB : (typeof indexedDB !== 'undefined' ? indexedDB : null);
    const now = opts.now || (() => new Date());
    const storage = 'storage' in opts ? opts.storage : (typeof navigator !== 'undefined' ? navigator.storage : undefined);
    if (!idb) return Promise.reject(noIdb());
    return new Promise((resolve, reject) => {
      let r;
      try { r = idb.open(opts.name || DB_NAME, DB_VERSION); } catch (e) { reject(noIdb(e)); return; }
      r.onupgradeneeded = (e) => { for (let v = e.oldVersion; v < DB_VERSION; v++) MIGRATIONS[v](r.result, r.transaction); };
      r.onsuccess = () => resolve(makeApi(r.result, now, storage));
      r.onerror = () => reject(noIdb(r.error));
    });
  }

  function makeApi(db, now, storage) {
    db.onversionchange = () => db.close();
    const ALL = ['shifts', 'payslips', 'settings', 'meta'];

    function touch(t) {
      const m = t.objectStore('meta');
      const g = m.get('meta');
      g.onsuccess = () => m.put({ ...DEFAULT_META, ...(g.result || {}), lastChangeAt: now().toISOString() }, 'meta');
    }
    async function write(names, fn, stamp) {
      let t;
      try {
        t = db.transaction(stamp === false ? names : names.concat('meta'), 'readwrite');
        const done = txDone(t);
        fn(t);
        if (stamp !== false) touch(t);
        await done;
      } catch (e) {
        try { if (t) t.abort(); } catch (e2) { /* already finished */ }
        throw storeError(e);
      }
    }
    // settingsMode: 'keep' leaves settings alone when data.settings is null; 'exact' deletes them.
    function fill(t, data, settingsMode) {
      const shifts = t.objectStore('shifts'), payslips = t.objectStore('payslips'), settings = t.objectStore('settings');
      shifts.clear(); payslips.clear();
      for (const s of Object.values(data.shifts || {})) shifts.put(s);
      for (const p of Object.values(data.payslips || {})) payslips.put(p);
      if (data.settings) settings.put(data.settings, 'settings');
      else if (settingsMode === 'exact') settings.delete('settings');
    }

    async function getAll() {
      const t = db.transaction(ALL, 'readonly');
      const [sh, ps, st, me] = await Promise.all([
        reqP(t.objectStore('shifts').getAll()), reqP(t.objectStore('payslips').getAll()),
        reqP(t.objectStore('settings').get('settings')), reqP(t.objectStore('meta').get('meta')),
      ]);
      const shifts = {}, payslips = {};
      for (const s of sh) shifts[s.date] = s;
      for (const p of ps) payslips[p.month] = p;
      return { shifts, payslips, settings: st || null, meta: { ...DEFAULT_META, ...(me || {}) } };
    }
    async function getMeta() {
      const t = db.transaction(['meta'], 'readonly');
      return { ...DEFAULT_META, ...((await reqP(t.objectStore('meta').get('meta'))) || {}) };
    }
    function setMeta(patch) {
      return write(['meta'], (t) => {
        const m = t.objectStore('meta');
        const g = m.get('meta');
        g.onsuccess = () => m.put({ ...DEFAULT_META, ...(g.result || {}), ...patch }, 'meta');
      }, false);
    }
    async function hasUndo() {
      const t = db.transaction(['undo'], 'readonly');
      return !!(await reqP(t.objectStore('undo').get('beforeRestore')));
    }
    async function saveUndo() {
      const snap = await getAll();
      await write(['undo'], (t) => t.objectStore('undo').put(
        { shifts: snap.shifts, payslips: snap.payslips, settings: snap.settings, takenAt: now().toISOString() }, 'beforeRestore'), false);
    }
    async function restoreUndo() {
      const t0 = db.transaction(['undo'], 'readonly');
      const snap = await reqP(t0.objectStore('undo').get('beforeRestore'));
      if (!snap) return false;
      await write(['shifts', 'payslips', 'settings', 'undo'], (t) => {
        fill(t, snap, 'exact');
        t.objectStore('undo').delete('beforeRestore');
      });
      return true;
    }
    async function requestPersist() {
      if (!storage || typeof storage.persist !== 'function') return null;
      try { return !!(await storage.persist()); } catch (e) { return false; }
    }
    async function isPersisted() {
      if (!storage || typeof storage.persisted !== 'function') return null;
      try { return !!(await storage.persisted()); } catch (e) { return null; }
    }

    return {
      getAll, getMeta, setMeta, hasUndo, saveUndo, restoreUndo, requestPersist, isPersisted,
      putShift: (doc) => write(['shifts'], (t) => t.objectStore('shifts').put(doc)),
      deleteShift: (date) => write(['shifts'], (t) => t.objectStore('shifts').delete(date)),
      putPayslip: (doc) => write(['payslips'], (t) => t.objectStore('payslips').put(doc)),
      deletePayslip: (month) => write(['payslips'], (t) => t.objectStore('payslips').delete(month)),
      putSettings: (s) => write(['settings'], (t) => t.objectStore('settings').put(s, 'settings')),
      replaceAll: (data) => write(['shifts', 'payslips', 'settings'], (t) => fill(t, data, 'keep')),
      close: () => db.close(),
    };
  }

  return { openStore, DB_NAME, DB_VERSION, DEFAULT_META };
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all 9 store tests pass. (This exact code and these scenarios were also run against real IndexedDB in Chromium while writing this plan: 9/9.)

- [ ] **Step 5: Commit and open the PR**

```bash
git checkout -b task-5-store
git add src/store.js tests/store.test.js
git commit -m "feat: IndexedDB store with change stamps, restore undo and persistent-storage request"
git push -u origin task-5-store
```

---

### Task 6: Page shell, offline cache, icons and fonts

**Files:**
- Create: `index.html`, `styles.css`, `manifest.webmanifest`, `sw.js`, `src/version.js`, `icons/icon.svg`, `icons/icon-180.png`, `icons/icon-192.png`, `icons/icon-512.png`, `scripts/make-icons.js`, `fonts/*.woff2` (8 files)
- Test: `tests/shell.test.js`

**Interfaces:**
- Consumes: `reference/artifact-app.src.html` (markup + `<style>`).
- Produces: `index.html` with **every element id the artifact's `app.js` uses** (unchanged), plus new containers `#banners`, `#onboarding`, `#status`, `#restore-file`; script tags in this order: `src/version.js`, `src/calc.js`, `src/format.js`, `src/i18n.js`, `src/backup.js`, `src/store.js`, `src/app.js`; `self.APP_VERSION`; `sw.js` with `VERSION` equal to `APP_VERSION` and a `SHELL` list of every file the app needs.

- [ ] **Step 1: Write the failing test `tests/shell.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('sw.js VERSION matches src/version.js APP_VERSION', () => {
  const { APP_VERSION } = require('../src/version.js');
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(/const VERSION = '([^']+)'/.exec(sw)[1], APP_VERSION);
});
test('every file in the offline SHELL list exists', () => {
  const list = JSON.parse(/const SHELL = (\[[\s\S]*?\]);/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of list) {
    if (f === './') continue;
    assert.ok(fs.existsSync(path.join(root, f)), 'missing ' + f);
  }
});
test('index.html loads the scripts in dependency order and links the manifest', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const order = ['src/version.js', 'src/calc.js', 'src/format.js', 'src/i18n.js', 'src/backup.js', 'src/store.js', 'src/app.js'];
  const pos = order.map((s) => html.indexOf('src="' + s + '"'));
  assert.ok(pos.every((p) => p > 0), 'all scripts present');
  assert.deepEqual([...pos].sort((a, b) => a - b), pos);
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  assert.match(html, /apple-touch-icon/);
  assert.doesNotMatch(html, /fonts\.googleapis|cdnjs|jsdelivr|unpkg/);
});
test('styles.css uses only local fonts', () => {
  const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
  assert.doesNotMatch(css, /https?:\/\//);
  assert.match(css, /@font-face/);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/shell.test.js`
Expected: FAIL with `ENOENT … sw.js`.

- [ ] **Step 3: Write `src/version.js`**

```js
/* The app version. Bump it on every release; sw.js must carry the same value. */
(function (root) {
  const APP_VERSION = '1.0.0';
  if (typeof module === 'object' && module.exports) module.exports = { APP_VERSION };
  else root.APP_VERSION = APP_VERSION;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: Copy the fonts**

```bash
npm install --no-audit --no-fund
mkdir -p fonts
for f in big-shoulders-display-latin-600-normal big-shoulders-display-latin-800-normal; do cp node_modules/@fontsource/big-shoulders-display/files/$f.woff2 fonts/; done
for f in public-sans-latin-400-normal public-sans-latin-500-normal public-sans-latin-600-normal public-sans-latin-700-normal; do cp node_modules/@fontsource/public-sans/files/$f.woff2 fonts/; done
for f in ibm-plex-mono-latin-400-normal ibm-plex-mono-latin-500-normal; do cp node_modules/@fontsource/ibm-plex-mono/files/$f.woff2 fonts/; done
ls fonts | wc -l
```

Expected: `8`. (The `latin` subset covers ä ö ü ß, € and −.) If npm is blocked, ask Udit to download these 8 files from the Fontsource website and drop them in `fonts/`.

- [ ] **Step 5: Write `styles.css`**

Copy everything between `<style>` and `</style>` in `reference/artifact-app.src.html` into `styles.css`, then put these lines at the very top of the file (above the `/* Layout: …` comment):

```css
@font-face { font-family: "Big Shoulders Display"; font-weight: 600; font-display: swap; src: url("fonts/big-shoulders-display-latin-600-normal.woff2") format("woff2"); }
@font-face { font-family: "Big Shoulders Display"; font-weight: 800; font-display: swap; src: url("fonts/big-shoulders-display-latin-800-normal.woff2") format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 400; font-display: swap; src: url("fonts/public-sans-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 500; font-display: swap; src: url("fonts/public-sans-latin-500-normal.woff2") format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 600; font-display: swap; src: url("fonts/public-sans-latin-600-normal.woff2") format("woff2"); }
@font-face { font-family: "Public Sans"; font-weight: 700; font-display: swap; src: url("fonts/public-sans-latin-700-normal.woff2") format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 400; font-display: swap; src: url("fonts/ibm-plex-mono-latin-400-normal.woff2") format("woff2"); }
@font-face { font-family: "IBM Plex Mono"; font-weight: 500; font-display: swap; src: url("fonts/ibm-plex-mono-latin-500-normal.woff2") format("woff2"); }
```

and append at the end of the file:

```css
/* banners (Safari tab, backup reminder, update, no storage) */
#banners { display: flex; flex-direction: column; gap: 8px; }
.banner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; border-radius: var(--r); padding: 10px 12px; font-size: .88rem; background: var(--warn-bg); color: var(--warn); }
.banner.bad { background: var(--bad-bg); color: var(--bad); }
.banner p { margin: 0; flex: 1 1 220px; min-width: 0; }
.banner small { display: block; opacity: .85; }
.banner .btn { min-height: 36px; padding: 6px 12px; color: var(--ink); }
/* onboarding */
.ob-step { display: flex; flex-direction: column; gap: 14px; }
.ob-dots { display: flex; gap: 6px; }
.ob-dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
.ob-dots i.on { background: var(--accent); }
.choice { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.choice .btn[aria-pressed="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.status-line { font-size: .72rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-line.warn { color: var(--warn); }
```

Also make sure `html, body { height: 100%; }` is not set (the page scrolls normally).

- [ ] **Step 6: Write `index.html`**

Build it from `reference/artifact-app.src.html` in this order:
1. The head below.
2. The `<svg width="0" …>` symbol block, unchanged.
3. The `<header class="top">` block, with the `<span class="sync" id="sync" …>…</span>` element replaced by `<span class="status-line" id="status" role="status"></span>`.
4. `<main class="wrap" id="main">` with `<div id="banners" aria-live="polite"></div>` as its first child, then the four `<section>`s unchanged.
5. `<nav class="tabs">` unchanged.
6. The settings `<div class="sheet" id="settings" …>` unchanged.
7. The new onboarding sheet and file input below.
8. The script tags below (replacing the two inline `<script>` blocks).

Head:

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Shift Log</title>
<meta name="description" content="Shift and pay tracker for Adecco temps at Deutsche Post Obertshausen">
<meta name="theme-color" content="#e7eaed" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0e141b" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Shift Log">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" href="icons/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="styles.css">
<style>:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); } body { margin: 0; } [hidden] { display: none !important; } img { max-width: 100%; }</style>
</head>
<body>
```

Onboarding sheet, file input and scripts (just before `</body>`):

```html
<div class="sheet" id="onboarding" hidden role="dialog" aria-modal="true" aria-labelledby="ob-title">
  <div class="wrap" id="ob-body"></div>
</div>
<input type="file" id="restore-file" accept=".json,application/json" hidden>
<script src="src/version.js"></script>
<script src="src/calc.js"></script>
<script src="src/format.js"></script>
<script src="src/i18n.js"></script>
<script src="src/backup.js"></script>
<script src="src/store.js"></script>
<script src="src/app.js"></script>
</body>
</html>
```

Create a placeholder `src/app.js` containing only `/* Ported in Task 7. */` so the page and the offline list are complete. Task 7 replaces it.

- [ ] **Step 7: Write `manifest.webmanifest`**

```json
{
  "name": "Shift Log",
  "short_name": "Shift Log",
  "description": "Shift and pay tracker for Adecco temps at Deutsche Post Obertshausen",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#e7eaed",
  "theme_color": "#142231",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 8: Write `sw.js`**

```js
/* Offline cache. Everything is served cache-first from one versioned cache, so HTML and JS always match.
   A new version installs in the background and waits; the app shows "Reload", which posts SKIP_WAITING. */
const VERSION = '1.0.0';
const CACHE = 'shift-log-' + VERSION;
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/version.js',
  'src/calc.js',
  'src/format.js',
  'src/i18n.js',
  'src/backup.js',
  'src/store.js',
  'src/app.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'fonts/big-shoulders-display-latin-600-normal.woff2',
  'fonts/big-shoulders-display-latin-800-normal.woff2',
  'fonts/public-sans-latin-400-normal.woff2',
  'fonts/public-sans-latin-500-normal.woff2',
  'fonts/public-sans-latin-600-normal.woff2',
  'fonts/public-sans-latin-700-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shift-log-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html', { cacheName: CACHE }).then((hit) => hit || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
```

- [ ] **Step 9: Write `icons/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="0" fill="#142231"/>
  <circle cx="256" cy="256" r="150" fill="none" stroke="#e6ebf0" stroke-width="28"/>
  <path d="M256 106 A150 150 0 0 1 406 256" fill="none" stroke="#f0b04a" stroke-width="28" stroke-linecap="round"/>
  <path d="M256 170 V256 L316 292" fill="none" stroke="#e6ebf0" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

(The amber quarter arc is the night bonus window; the square background lets iOS round the corners itself.)

- [ ] **Step 10: Write `scripts/make-icons.js` and generate the PNGs**

```js
// Renders icons/icon.svg to the PNG sizes iOS and the manifest need. Run: node scripts/make-icons.js
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'icons', 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const size of [180, 192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent('<html><body style="margin:0">' + svg.replace('<svg ', '<svg width="' + size + '" height="' + size + '" ') + '</body></html>');
    await page.screenshot({ path: path.join(__dirname, '..', 'icons', 'icon-' + size + '.png'), omitBackground: false });
    await page.close();
  }
  await browser.close();
})();
```

Run: `npx playwright install chromium && node scripts/make-icons.js && ls icons`
Expected: `icon-180.png icon-192.png icon-512.png icon.svg`. (If Chromium is already installed in your workspace, skip the install. If neither works, commit the SVG and the script and note in the PR that CI or Udit must run it.)

- [ ] **Step 11: Run the tests**

Run: `npm test`
Expected: the 4 shell tests pass, everything else still passes.

- [ ] **Step 12: Check the page opens with no network errors**

Run: `python3 -m http.server 4173` and open `http://localhost:4173/` in a browser (or Playwright). Expected: the artifact's layout appears (empty, since `app.js` is a placeholder), fonts load from `fonts/`, the console shows no 404s.

- [ ] **Step 13: Commit and open the PR**

```bash
git checkout -b task-6-shell
git add index.html styles.css manifest.webmanifest sw.js src/version.js src/app.js icons fonts scripts tests/shell.test.js
git commit -m "feat: page shell, offline service worker, manifest, icons, self-hosted fonts"
git push -u origin task-6-shell
```

---

### Task 7: Port the four tabs to `src/app.js` (Store, Fmt, I18n)

**Files:**
- Create: `src/app.js` (from `reference/artifact-app.js`)
- Modify: `src/i18n.js` (add tab strings in both languages), `index.html` (add `data-i18n` attributes)
- Test: `tests/i18n.test.js` (existing parity tests guard the new keys); manual run in the browser

**Interfaces:**
- Consumes: `Calc.*`; `Fmt.*` (Task 2); `I18n.t/setLang/getLang/detectLang` (Task 3); `Backup.appDefaults/mergeSettings` (Task 4); `Store.openStore` and its API (Task 5); element ids in `index.html` (Task 6).
- Produces (used by Task 8, all inside the app's closure): `state` (`shifts`, `payslips`, `settingsDoc`, `settings`, `meta`, `loaded`, `tab`, …), `store`, `reload()`, `write(path, body)`, `writeError(e)`, `bump()`, `msg(id, text, isError)`, `arm(btn, label)`, `disarm(btn)`, `shareFile(name, text, mime)` → `'shared'|'downloaded'|'cancelled'`, `renderStatus()`, `applyStaticText()`, `setTab(t)`, `resetForm(date?, keepTimes?)`, `t` (alias of `I18n.t`), `defaults()`.

- [ ] **Step 1: Start from the reference**

```bash
git checkout -b task-7-port-tabs
cp reference/artifact-app.js src/app.js
```

- [ ] **Step 2: Replace the formatting helpers with `Fmt`**

Delete from `src/app.js` the local definitions of `pad`, `nf2`, `r2`, `clean`, `n2`, `eur`, `sEur`, `hrs`, `sHrs`, `WD`, `MONTHS`, `dm`, `dmy`, `wd`, `monthName`, `monthShort`, `todayStr`, `normTime`, `parseNum`, `numIn` (the block under `// ---------- formatting`), keeping `nf4` and `STATUS`. Put this in their place:

```js
  const { pad, r2, n2, eur, sEur, hrs, sHrs, dm, dmy, normTime, parseNum, numIn } = Fmt;
  const t = I18n.t;
  const wd = (ds) => Fmt.wd(ds, I18n.getLang());
  const monthName = (ym) => Fmt.monthName(ym, I18n.getLang());
  const monthShort = (ym) => Fmt.monthShort(ym, I18n.getLang());
  const todayStr = () => Fmt.todayStr();
  const nf4 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
```

Change `STATUS` to read from the language at call time:

```js
  const STATUS = { get worked() { return t('status.worked'); }, get dayoff() { return t('status.dayoff'); }, get sick() { return t('status.sick'); }, get vacation() { return t('status.vacation'); } };
```

- [ ] **Step 3: Replace the storage layer**

Delete from `src/app.js`: `let db = null;`, `let readOnly = false;`, the whole `// ---------- sync indicator` block (`pending`, `setSync`, `syncIdle`), the whole `// ---------- store: db capability…` block (`LKEY`, `loadLocal`, `saveLocal`, `chains`, `queued`, `write`, `writeError`), `subscribe()`, and `mergeSettings()`. In the `state` object, add `meta: Store.DEFAULT_META` and change `settings: C.defaultSettings()` to `settings: Backup.mergeSettings(null, Backup.appDefaults(Calc.defaultSettings(), 'en'))` (so the job label and new keys exist before the store opens). Then add:

```js
  // ---------- storage (IndexedDB via Store) ----------
  let store = null;
  const defaults = () => Backup.appDefaults(Calc.defaultSettings(), I18n.detectLang(navigator.language));

  async function reload() {
    const all = await store.getAll();
    state.shifts = all.shifts;
    state.payslips = all.payslips;
    state.meta = all.meta;
    state.settingsDoc = all.settings;
    state.settings = Backup.mergeSettings(all.settings, defaults());
    I18n.setLang(state.settings.lang);
    state.loaded = true;
    applyStaticText();
    renderStatus();
    bump();
  }

  // Same call shape the artifact used: write('shifts/2026-10-05', doc) or write('shifts/2026-10-05', null) to delete.
  async function write(path, body) {
    if (!store) throw Object.assign(new Error('Storage unavailable'), { code: 'no-idb' });
    const [col, id] = path.split('/');
    if (col === 'shifts') await (body ? store.putShift(body) : store.deleteShift(id));
    else if (col === 'payslips') await (body ? store.putPayslip(body) : store.deletePayslip(id));
    else if (col === 'settings') await store.putSettings(body);
    else throw new Error('Unknown collection ' + col);
    await reload();
  }

  function writeError(e) {
    return t(e && e.code === 'quota' ? 'err.saveFull' : 'err.save');
  }

  function renderStatus() {
    const el = $('status');
    if (!el) return;
    const last = state.meta.lastBackupAt;
    el.className = 'status-line' + (last ? '' : ' warn');
    el.textContent = t('status.saved') + ' · ' + (last ? t('status.lastBackup', { when: whenText(last) }) : t('status.noBackup'));
  }

  function whenText(iso) {
    const n = Fmt.daysAgo(iso);
    return n <= 0 ? t('when.today') : n === 1 ? t('when.yesterday') : t('when.daysAgo', { n });
  }
```

Keep every existing `await write('…', …)` call site as it is. In the payslip save handler, the derived-settings code (`let ns = JSON.parse(JSON.stringify(S()))`) stays.

- [ ] **Step 4: Replace the CSV download with the share helper**

Add:

```js
  // Offers a file: iOS share sheet when files can be shared, otherwise a normal download.
  // Call it without awaiting anything before it inside a tap handler (iOS needs the tap's user activation).
  async function shareFile(name, text, mime) {
    const file = new File([text], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; throw e; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  }
```

Replace the whole `$('csv-btn').addEventListener('click', …)` handler with:

```js
  $('csv-btn').addEventListener('click', () => {
    const name = 'shift-log-' + todayStr() + '.csv';
    shareFile(name, '﻿' + buildCsv(), 'text/csv').then(
      (r) => msg('csv-msg', r === 'cancelled' ? t('csv.cancelled') : t('csv.saved', { name })),
      () => { $('csv-box').hidden = false; $('csv-text').value = buildCsv(); msg('csv-msg', t('csv.fallback')); });
  });
```

In `buildCsv`, make the header row and weekday follow the language: `const head = t('csv.head').split(';');` (add `csv.head` in both languages with the same 18 semicolon-separated columns as the artifact).

- [ ] **Step 5: Replace the boot sequence**

Replace the whole `async function boot() { … }` with:

```js
  async function boot() {
    I18n.setLang(I18n.detectLang(navigator.language));
    applyStaticText();
    F.date.value = todayStr();
    F.brk.value = Calc.defaultSettings().defaultBreakMin;
    let start = (location.hash || '').slice(1);
    if (!TABS.includes(start)) { try { start = localStorage.getItem('shiftlog-tab') || 'shifts'; } catch (e) { start = 'shifts'; } }
    try {
      store = await Store.openStore();
    } catch (e) {
      showNoStorage();
      return;
    }
    await reload();
    F.brk.value = S().defaultBreakMin;
    setTab(start, true);
    renderPreview();
  }

  function showNoStorage() {
    $('banners').innerHTML = '<div class="banner bad" role="alert"><p>' + esc(t('banner.noStorage')) + '</p></div>';
    for (const el of document.querySelectorAll('main input, main select, main button[type=submit]')) el.disabled = true;
  }
```

- [ ] **Step 6: Move every visible English text into `I18n`**

1. In `index.html`, give every element whose text is static UI copy a `data-i18n="key"` attribute, and every `placeholder` a `data-i18n-ph="key"`. Examples:

```html
<h2 id="form-title" data-i18n="shifts.add">Add shift</h2>
<label class="field"><span data-i18n="shifts.date">Date (shift start)</span><input type="date" id="f-date" required></label>
<option value="worked" data-i18n="status.worked">Worked</option>
<input id="f-note" maxlength="200" data-i18n-ph="shifts.notePh" placeholder="Optional">
<button type="button" role="tab" data-tab="summary" aria-selected="false"><svg><use href="#i-bars"/></svg><span data-i18n="tab.summary">Summary</span></button>
```

2. Add to `src/app.js`:

```js
  function applyStaticText() {
    document.documentElement.lang = I18n.getLang();
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  }
```

3. In `src/app.js`, replace every user-visible string literal (in `innerHTML` templates, `textContent`, `msg(…)` calls, tooltips, table headers, notes, tile labels, warnings shown from `r.warnings`) with `t('…')`. Name keys by screen: `tab.*`, `shifts.*`, `status.*`, `summary.*`, `account.*`, `payslip.*`, `settings.*`, `csv.*`, `warn.*`. Calc warnings: map `w.code` to `t('warn.' + w.code)` (codes: `same-time`, `over-10h`, `break-short`, `rest`, `overlap`; `rest` takes `{h}`). Save and delete messages keep the date: `t('shifts.saved', { date: wd(d) + ' ' + dmy(d) })` (Task 9 checks that the message contains `DD.MM.`).
4. Add every new key to **both** `en` and `de` in `src/i18n.js`. The German UI uses these terms: Schicht, Schichten, Pause, unbezahlt, Von, Bis, Bezahlt, Nacht, Sonntag, Feiertag, Grundlohn, Zuschläge, Brutto, Netto (geschätzt), Stundenlohn, Woche, Monat, Arbeitszeitkonto, Soll, Ist, Saldo, Lohnabrechnung, Einstellungen, Speichern, Löschen, Erneut tippen zum Löschen, Krank, Urlaub, Frei.

- [ ] **Step 7: Run the unit tests**

Run: `npm test`
Expected: all pass. The i18n parity tests fail if any new key is missing in one language or has mismatched `{placeholders}`. Fix until green.

- [ ] **Step 8: Run it in a browser and enter the seed week**

Run: `python3 -m http.server 4173`, open `http://localhost:4173/` (Playwright WebKit at 390×844 if available). Enter 05.10, 06.10 (22:00–06:30), 07.10 Day off, 08.10 (23:15–06:30), 09.10 (23:30–06:30).
Expected: the previews show `€ 147,55`, `€ 147,55`, `€ 127,43`, `€ 122,64`; the week header shows `29,25 h · € 545,17`; reloading keeps the data; the status line says "Saved on this iPhone · No backup yet". Switch the language in DevTools with `I18n.setLang('de'); applyStaticText()` (or after Task 8 in Settings) and check nothing English is left.

- [ ] **Step 9: Commit and open the PR**

```bash
git add src/app.js src/i18n.js index.html
git commit -m "feat: four tabs on IndexedDB with English/German text"
git push -u origin task-7-port-tabs
```

---

### Task 8: First launch, banners, backup/restore, settings additions, updates

**Files:**
- Modify: `src/app.js`, `index.html` (settings fieldsets), `src/i18n.js` (any extra keys)
- Test: unit tests stay green; behaviour is covered end-to-end in Task 9

**Interfaces:**
- Consumes: everything listed under Task 7 "Produces"; `Backup.buildBackup/backupFileName/parseBackup/mergeMissing/backupDue`; `Store` API; `self.APP_VERSION`.
- Produces: element ids used by Task 9: `#ob-body`, `#ob-lang-en`, `#ob-lang-de`, `#ob-next`, `#ob-back`, `#ob-start`, `#ob-end`, `#ob-hours`, `#ob-first`, `#ob-restore`, `#banners`, `#backup-now`, `#backup-btn`, `#backup-msg`, `#restore-btn`, `#restore-preview`, `#restore-replace`, `#restore-merge`, `#restore-msg`, `#undo-btn`, `#s-lang`, `#s-jobLabel`, `#s-backupReminderDays`, `#storage-status`, `#storage-counts`, `#about-version`, `#update-reload`.

- [ ] **Step 1: Add the settings fieldsets to `index.html`**

Inside `#settings .wrap`, directly after the `<p class="note">` under the heading, add:

```html
<fieldset><legend data-i18n="settings.language">Language</legend>
  <div class="choice">
    <select id="s-lang" aria-label="Language"><option value="en">English</option><option value="de">Deutsch</option></select>
  </div>
  <label class="field"><span data-i18n="settings.jobLabel">Job label</span><input id="s-jobLabel" maxlength="80"></label>
</fieldset>
<fieldset><legend data-i18n="settings.backup">Backup &amp; restore</legend>
  <p class="note" id="backup-last"></p>
  <div class="btnrow">
    <button class="btn primary" type="button" id="backup-btn" data-i18n="backup.save">Save backup</button>
    <button class="btn" type="button" id="restore-btn" data-i18n="restore.pick">Restore from backup</button>
    <button class="btn" type="button" id="undo-btn" hidden data-i18n="restore.undo">Undo restore</button>
  </div>
  <div id="restore-preview" hidden></div>
  <p class="msg" id="backup-msg"></p>
  <p class="msg" id="restore-msg"></p>
  <label class="field"><span data-i18n="settings.reminderDays">Remind me to back up after (days)</span><input id="s-backupReminderDays" inputmode="numeric"></label>
</fieldset>
<fieldset><legend data-i18n="settings.storage">Storage</legend>
  <p id="storage-status"></p>
  <p class="note" id="storage-counts"></p>
</fieldset>
<fieldset><legend data-i18n="settings.about">About</legend>
  <p id="about-version"></p>
  <p class="note"><a href="https://github.com/" id="repo-link" target="_blank" rel="noopener">GitHub</a></p>
</fieldset>
```

(Set `#repo-link` `href` to the real repo URL.)

- [ ] **Step 2: Banners**

Add to `src/app.js` and call `renderBanners()` at the end of `reload()` and of `renderStatus()`:

```js
  let updateWorker = null;
  const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

  function banner(kind, text, sub, buttons) {
    return '<div class="banner' + (kind === 'bad' ? ' bad' : '') + '"><p>' + esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</p>' +
      (buttons || []).map(([id, label]) => '<button type="button" class="btn" id="' + id + '">' + esc(label) + '</button>').join('') + '</div>';
  }

  function renderBanners() {
    const out = [];
    if (updateWorker) out.push(banner('warn', t('banner.update'), '', [['update-reload', t('banner.reload')]]));
    if (!isStandalone()) out.push(banner('warn', t('banner.safari'), t('ob.home.steps')));
    const due = Backup.backupDue(state.meta, state.settings, Object.keys(state.shifts).length, new Date());
    if (due) out.push(banner('warn', due.never ? t('banner.neverBackedUp') : t('banner.backupDue', { when: whenText(state.meta.lastBackupAt) }), '', [['backup-now', t('backup.save')]]));
    $('banners').innerHTML = out.join('');
  }

  $('banners').addEventListener('click', (e) => {
    if (e.target.id === 'backup-now') doBackup('f-msg');
    if (e.target.id === 'update-reload' && updateWorker) updateWorker.postMessage('SKIP_WAITING');
  });
```

- [ ] **Step 3: Backup**

```js
  // Must not await before shareFile(): iOS needs the tap's user activation for the share sheet.
  function doBackup(msgId) {
    const now = new Date();
    const file = Backup.buildBackup({ shifts: state.shifts, payslips: state.payslips, settings: state.settingsDoc || state.settings }, now, self.APP_VERSION);
    shareFile(Backup.backupFileName(now), JSON.stringify(file, null, 1), 'application/json').then(async (r) => {
      if (r === 'cancelled') return msg(msgId, t('backup.cancelled'));
      await store.setMeta({ lastBackupAt: now.toISOString() });
      await reload();
      msg(msgId, t('backup.saved'));
    }, () => msg(msgId, t('backup.failed'), true));
  }
  $('backup-btn').addEventListener('click', () => doBackup('backup-msg'));
```

- [ ] **Step 4: Restore with preview and undo**

```js
  let pendingRestore = null;
  $('restore-btn').addEventListener('click', () => $('restore-file').click());
  $('restore-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const r = Backup.parseBackup(await f.text());
    const target = $('onboarding').hidden ? 'restore-msg' : 'ob-msg';
    if (!r.ok) { pendingRestore = null; $('restore-preview').hidden = true; return msg(target, t('restore.err.' + r.code, { detail: r.detail }), true); }
    pendingRestore = r;
    if (!$('onboarding').hidden) return applyRestore('replace', 'ob-msg').then(finishOnboardingAfterRestore);
    const s = r.summary;
    $('restore-preview').innerHTML = '<p>' + esc(t('restore.preview', {
      shifts: s.shifts, payslips: s.payslips, first: s.first ? dmy(s.first) : '–', last: s.last ? dmy(s.last) : '–',
      saved: s.exportedAt ? dmy(s.exportedAt.slice(0, 10)) : '–',
    })) + '</p><div class="btnrow"><button class="btn primary" type="button" id="restore-replace">' + esc(t('restore.replace')) +
      '</button><button class="btn" type="button" id="restore-merge">' + esc(t('restore.merge')) + '</button></div>';
    $('restore-preview').hidden = false;
    msg('restore-msg', '');
  });
  $('restore-preview').addEventListener('click', (e) => {
    if (e.target.id === 'restore-replace') applyRestore('replace', 'restore-msg');
    if (e.target.id === 'restore-merge') applyRestore('merge', 'restore-msg');
  });

  async function applyRestore(mode, msgId) {
    const r = pendingRestore;
    if (!r) return;
    pendingRestore = null;
    $('restore-preview').hidden = true;
    try {
      await store.saveUndo();
      const current = { shifts: state.shifts, payslips: state.payslips, settings: state.settingsDoc };
      await store.replaceAll(mode === 'merge' ? Backup.mergeMissing(current, r.data) : r.data);
      await store.setMeta({ onboarded: true });
      await reload();
      msg(msgId, t('restore.done', { shifts: Object.keys(state.shifts).length, payslips: Object.keys(state.payslips).length }));
    } catch (err) { msg(msgId, writeError(err), true); }
    $('undo-btn').hidden = !(await store.hasUndo());
  }

  $('undo-btn').addEventListener('click', async () => {
    try { await store.restoreUndo(); await reload(); msg('restore-msg', t('restore.undone')); }
    catch (err) { msg('restore-msg', writeError(err), true); }
    $('undo-btn').hidden = !(await store.hasUndo());
  });
```

- [ ] **Step 5: Language, job label, reminder days, storage, about**

1. In `fillSettings(s)` add:

```js
    $('s-lang').value = s.lang;
    $('s-jobLabel').value = s.jobLabel || '';
    $('s-backupReminderDays').value = s.backupReminderDays;
    $('backup-last').textContent = state.meta.lastBackupAt ? t('status.lastBackup', { when: whenText(state.meta.lastBackupAt) }) : t('status.noBackup');
    $('storage-counts').textContent = t('storage.counts', { shifts: Object.keys(state.shifts).length, payslips: Object.keys(state.payslips).length });
    $('about-version').textContent = t('settings.version', { v: self.APP_VERSION });
    store.isPersisted().then((p) => { $('storage-status').textContent = t(p === true ? 'storage.persisted' : p === false ? 'storage.notPersisted' : 'storage.unknown'); });
    store.hasUndo().then((u) => { $('undo-btn').hidden = !u; });
```

2. In `readSettings()` add, before `return s;`:

```js
    s.jobLabel = $('s-jobLabel').value.trim() || defaults().jobLabel;
    const rd = parseNum($('s-backupReminderDays').value);
    if (!(rd >= 1)) err(t('settings.reminderDaysErr'));
    s.backupReminderDays = Math.round(rd);
```

(add `settings.reminderDaysErr` to both languages: "Reminder days must be 1 or more." / "Erinnerung: mindestens 1 Tag.")

3. Language applies immediately and keeps whatever is typed in any form:

```js
  $('s-lang').addEventListener('change', async (e) => {
    const s = { ...S(), lang: e.target.value };
    try { await write('settings/settings', s); fillSettings(S()); renderPreview(); }
    catch (err) { msg('set-msg', writeError(err), true); }
  });
```

4. The header subtitle shows the job label: at the end of `applyStaticText()` add `const sub = document.querySelector('.brand p'); if (sub && S().jobLabel) sub.textContent = S().jobLabel;`.

- [ ] **Step 6: First launch**

```js
  const OB = { step: 0, draft: null };
  const obSteps = () => (isStandalone() ? ['lang', 'contract', 'start'] : ['lang', 'contract', 'home', 'start']);

  function startOnboarding() {
    const s = S();
    OB.step = 0;
    OB.draft = { lang: s.lang, assignmentStart: s.assignmentStart, assignmentEnd: s.assignmentEnd, weeklyHours: s.weeklyHours };
    $('onboarding').hidden = false;
    renderOnboarding();
  }

  function renderOnboarding() {
    I18n.setLang(OB.draft.lang);
    applyStaticText();
    const steps = obSteps(), step = steps[OB.step];
    const dots = '<div class="ob-dots" aria-hidden="true">' + steps.map((_, i) => '<i class="' + (i === OB.step ? 'on' : '') + '"></i>').join('') + '</div>';
    const nav = (next) => '<div class="btnrow">' + (OB.step ? '<button class="btn" type="button" id="ob-back">' + esc(t('common.back')) + '</button>' : '') +
      (next ? '<button class="btn primary" type="button" id="ob-next">' + esc(t('common.next')) + '</button>' : '') + '</div>';
    let body = '';
    if (step === 'lang') {
      body = '<h2 id="ob-title">' + esc(t('ob.lang.title')) + '</h2><div class="choice">' +
        '<button class="btn" type="button" id="ob-lang-en" aria-pressed="' + (OB.draft.lang === 'en') + '">English</button>' +
        '<button class="btn" type="button" id="ob-lang-de" aria-pressed="' + (OB.draft.lang === 'de') + '">Deutsch</button></div>' + nav(true);
    } else if (step === 'contract') {
      body = '<h2 id="ob-title">' + esc(t('ob.contract.title')) + '</h2><p class="note">' + esc(t('ob.contract.body')) + '</p><div class="fields">' +
        '<label class="field"><span>' + esc(t('field.assignmentStart')) + '</span><input type="date" id="ob-start" value="' + esc(OB.draft.assignmentStart) + '"></label>' +
        '<label class="field"><span>' + esc(t('field.assignmentEnd')) + '</span><input type="date" id="ob-end" value="' + esc(OB.draft.assignmentEnd) + '"></label>' +
        '<label class="field wide"><span>' + esc(t('field.weeklyHours')) + '</span><input id="ob-hours" inputmode="decimal" value="' + esc(numIn(OB.draft.weeklyHours)) + '"></label></div>' + nav(true);
    } else if (step === 'home') {
      body = '<h2 id="ob-title">' + esc(t('ob.home.title')) + '</h2><p>' + esc(t('ob.home.steps')) + '</p><p class="note">' + esc(t('ob.home.why')) + '</p>' + nav(true);
    } else {
      body = '<h2 id="ob-title">' + esc(t('app.name')) + '</h2><p class="note">' + esc(t('ob.data.warning')) + '</p><div class="btnrow">' +
        '<button class="btn primary" type="button" id="ob-first">' + esc(t('ob.firstShift')) + '</button>' +
        '<button class="btn" type="button" id="ob-restore">' + esc(t('ob.restore')) + '</button></div>' + nav(false);
    }
    $('ob-body').innerHTML = '<div class="ob-step">' + dots + body + '<p class="msg" id="ob-msg"></p></div>';
  }

  function readObContract() {
    const h = parseNum($('ob-hours').value);
    if (!(h > 0 && h <= 48)) { msg('ob-msg', t('ob.hoursErr'), true); return false; }
    if (!$('ob-start').value) { msg('ob-msg', t('ob.startErr'), true); return false; }
    OB.draft.assignmentStart = $('ob-start').value;
    OB.draft.assignmentEnd = $('ob-end').value || '';
    OB.draft.weeklyHours = h;
    return true;
  }

  async function finishOnboarding() {
    await write('settings/settings', { ...S(), ...OB.draft });
    await store.setMeta({ onboarded: true, persistAsked: true });
    await store.requestPersist();
    await reload();
    $('onboarding').hidden = true;
  }
  async function finishOnboardingAfterRestore() {
    await store.setMeta({ persistAsked: true });
    await store.requestPersist();
    $('onboarding').hidden = true;
    setTab('shifts');
  }

  $('ob-body').addEventListener('click', async (e) => {
    const id = e.target.id;
    if (id === 'ob-lang-en' || id === 'ob-lang-de') { OB.draft.lang = id.slice(-2); renderOnboarding(); }
    else if (id === 'ob-back') { OB.step--; renderOnboarding(); }
    else if (id === 'ob-next') {
      if (obSteps()[OB.step] === 'contract' && !readObContract()) return;
      OB.step++; renderOnboarding();
    } else if (id === 'ob-first') { try { await finishOnboarding(); resetForm(); setTab('shifts'); F.from.focus(); } catch (err) { msg('ob-msg', writeError(err), true); } }
    else if (id === 'ob-restore') { $('restore-file').click(); }
  });
```

Add keys `ob.hoursErr` ("Enter your weekly hours, e.g. 23,07." / "Gib deine Wochenstunden ein, z. B. 23,07.") and `ob.startErr` ("Enter your assignment start date." / "Gib deinen Einsatzbeginn ein.") to both languages.

In `boot()`, replace `setTab(start, true);` with:

```js
    if (!state.meta.onboarded) { setTab('shifts', true); startOnboarding(); }
    else setTab(start, true);
```

- [ ] **Step 7: Service worker registration and the update banner**

Add at the end of `boot()`:

```js
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        const offer = (w) => { if (w && navigator.serviceWorker.controller) { updateWorker = w; renderBanners(); } };
        offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
        });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
      }).catch(() => {});
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    }
```

- [ ] **Step 8: Run the unit tests**

Run: `npm test`
Expected: all pass (i18n parity included).

- [ ] **Step 9: Walk through it in a browser**

Run `python3 -m http.server 4173`, open `http://localhost:4173/` in a fresh profile.
Expected: onboarding appears (language → contract → Home Screen → start); *Add my first shift* lands on the Shifts tab; after 3 shifts the "You haven't saved a backup yet" banner appears; *Save backup* downloads `shift-log-backup-<today>.json` and the status line changes to "last backup today"; Settings → *Restore from backup* with that file shows the preview; *Replace everything* then *Undo restore* both work; switching language in Settings changes every label and keeps a half-typed shift form.

- [ ] **Step 10: Commit and open the PR**

```bash
git checkout -b task-8-onboarding-backup
git add src/app.js src/i18n.js index.html
git commit -m "feat: first launch, backup reminder, backup/restore with undo, language switch, update banner"
git push -u origin task-8-onboarding-backup
```

---

### Task 9: End-to-end tests in WebKit and release

**Files:**
- Create: `playwright.config.js`, `tests/e2e/app.spec.js`
- Modify: `README.md` (release checklist)

**Interfaces:**
- Consumes: element ids from Tasks 6–8; the seed week numbers from the original spec §7.
- Produces: `npm run e2e` (run by CI before every deploy).

- [ ] **Step 1: Write `playwright.config.js`**

```js
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: { baseURL: 'http://localhost:4173', serviceWorkers: 'allow' },
  webServer: { command: 'python3 -m http.server 4173', port: 4173, reuseExistingServer: true },
  projects: [
    { name: 'iphone-light', use: { ...devices['iPhone 15'], colorScheme: 'light', locale: 'en-GB' }, grepInvert: /offline/ },
    { name: 'iphone-dark-de', use: { ...devices['iPhone 15'], colorScheme: 'dark', locale: 'de-DE' }, grepInvert: /offline/ },
    // Offline needs a running service worker under Playwright's network emulation, which is reliable in Chromium.
    { name: 'chromium-offline', use: { ...devices['Pixel 7'] }, grep: /offline/ },
  ],
});
```

- [ ] **Step 2: Write the failing end-to-end tests `tests/e2e/app.spec.js`**

```js
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

test('seed week entered by hand reproduces the spec numbers and survives a reload', async ({ page }) => {
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
  await expect(page.locator('#banners')).toContainText('can’t save data');
  await expect(page.locator('#f-save')).toBeDisabled();
});
```

Note: the `iphone-dark-de` project runs with a German phone locale, so onboarding preselects Deutsch; `onboard()` clicks `#ob-lang-en` so the English assertions still hold. The dark project proves the pages render in dark mode.

- [ ] **Step 3: Run them**

Run: `npx playwright install --with-deps webkit chromium && npm run e2e`
Expected: all tests pass in both projects. Fix the app (not the tests) until green. If WebKit can't be installed in your workspace, push and let CI run them.

- [ ] **Step 4: Add the release checklist to `README.md`**

```markdown
## Release checklist
1. Bump `APP_VERSION` in `src/version.js` **and** `VERSION` in `sw.js` (the shell test checks they match).
2. Merge to `main`; CI runs unit + WebKit tests and deploys to Pages.
3. On a real iPhone: open the Home Screen app, wait for "A new version is ready", tap Reload, check Settings → About shows the new version.
4. If the release touched storage or the service worker: add a shift, force-quit, reopen, save a backup to iCloud Drive.
```

- [ ] **Step 5: Commit and open the PR**

```bash
git checkout -b task-9-e2e-release
git add playwright.config.js tests/e2e README.md
git commit -m "test: WebKit end-to-end suite at iPhone size; release checklist"
git push -u origin task-9-e2e-release
```

- [ ] **Step 6: Udit's real-iPhone check (by hand, once)**

After the merge deploys: open the Pages URL in Safari on an iPhone → Add to Home Screen → open from the icon → onboard → add a shift → force-quit → reopen (shift still there) → Settings → Save backup → Save to Files → iCloud Drive. Then send the link and the README's three install steps to your friends.

---

## Later (not in this plan)

**UI upgrade** (Udit, this weekend): a separate brainstorm → spec → plan using the taste-skill (`taste-skill:design-taste-frontend`) and `ui-ux-pro-max:ui-ux-pro-max` skills. The e2e suite from Task 9 is the safety net: the upgrade must keep it green.
