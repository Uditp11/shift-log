// Static checks on the UI layer: every visible string goes through I18n, and the artifact's
// cloud/download code paths are gone. Behaviour in a real browser is covered by the e2e tests (Task 9).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const I = require('../src/i18n.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const calc = fs.readFileSync(path.join(root, 'src/calc.js'), 'utf8');
const EN = I.STRINGS.en;

// The page body without the icon sprite, scripts and comments.
const body = html.slice(html.indexOf('<body>'))
  .replace(/<svg[\s\S]*?<\/svg>/g, '')
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '');

test('every data-i18n key in index.html exists', () => {
  const keys = [...html.matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 50, 'index.html is tagged (' + keys.length + ' keys)');
  for (const k of keys) assert.ok(k in EN, 'missing key ' + k);
});

test('every visible text in index.html is tagged with data-i18n', () => {
  for (const m of body.matchAll(/<(\w+)([^>]*)>([^<]*)/g)) {
    const [, tag, attrs, text] = m;
    // translate="no": names that stay as they are in both languages (app name, job label from settings).
    if (!/[A-Za-zÄÖÜäöü]/.test(text) || tag === 'textarea' || /translate="no"/.test(attrs)) continue;
    assert.match(attrs, /data-i18n="/, '<' + tag + attrs + '> has untranslated text "' + text.trim() + '"');
  }
});

test('every placeholder and aria-label with words is tagged', () => {
  for (const m of body.matchAll(/<(\w+)([^>]*)>/g)) {
    const attrs = m[2];
    const ph = /placeholder="([^"]*)"/.exec(attrs);
    if (ph && /[A-Za-z]{2}/.test(ph[1])) assert.match(attrs, /data-i18n-ph="/, 'placeholder "' + ph[1] + '"');
    const aria = /aria-label="([^"]*)"/.exec(attrs);
    if (aria && /[A-Za-z]/.test(aria[1])) assert.match(attrs, /data-i18n-aria="/, 'aria-label "' + aria[1] + '"');
  }
});

test('every literal t(key) in src/app.js exists', () => {
  // A key ending in '.' is a prefix completed at run time (t('warn.' + w.code)); the warn test covers it.
  const keys = [...app.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.'));
  assert.ok(keys.length > 50, 'app.js uses t() (' + keys.length + ' calls)');
  for (const k of keys) assert.ok(k in EN, 'missing key ' + k);
  // keys picked in a ternary, e.g. t(paid ? 'shifts.breakPaid' : 'shifts.breakUnpaid')
  const named = [...app.matchAll(/'((?:tab|shifts|status|summary|account|payslip|settings|csv|warn|common)\.[\w.-]+)'/g)].map((m) => m[1]);
  for (const k of named) assert.ok(k in EN, 'missing key ' + k);
});

test('every calc warning code has a warn.* text, rest shows the hours', () => {
  const codes = new Set([...calc.matchAll(/code: '([\w-]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...codes].sort(), ['break-short', 'over-10h', 'overlap', 'rest', 'same-time']);
  for (const c of codes) assert.ok('warn.' + c in EN, 'missing warn.' + c);
  assert.match(EN['warn.rest'], /\{h\}/);
  assert.match(app, /t\('warn\.' \+ w\.code/);
});

test('CSV header has the artifact\'s 18 columns in both languages', () => {
  for (const lang of ['en', 'de']) assert.equal(I.STRINGS[lang]['csv.head'].split(';').length, 18, lang);
});

test('app.js uses Fmt, I18n and Store instead of the artifact\'s own code paths', () => {
  assert.doesNotMatch(app, /window\.claude/, 'no artifact db/downloads capability');
  assert.doesNotMatch(app, /shiftlog-local-v1/, 'no localStorage data copy');
  assert.doesNotMatch(app, /const (WD|MONTHS|nf2) =/, 'formatting comes from Fmt');
  assert.match(app, /Store\.openStore\(/);
  assert.match(app, /Backup\.mergeSettings\(/);
  assert.match(app, /= Fmt;/);
  assert.match(app, /navigator\.share\(/);
});
