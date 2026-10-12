// The design tokens: contrast pairs, light/dark parity, tokens only, icons.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');

function block(re, name) {
  const m = re.exec(css);
  assert.ok(m, 'styles.css has the ' + name + ' token block');
  return m[1];
}
const LIGHT_BODY = block(/^:root\s*\{([^}]*)\}/m, 'light');
const MEDIA_BODY = block(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}\s*\}/, 'dark (phone setting)');
const DARK_BODY = block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/, 'dark (theme choice)');
const colours = (body) => Object.fromEntries([...body.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2].toLowerCase()]));
const LIGHT = colours(LIGHT_BODY);
const DARK = { ...LIGHT, ...colours(DARK_BODY) };

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum]: text 4.5 (ink 7), controls, chart marks and focus 3.
const PAIRS = [
  ['ink', 'bg', 7], ['ink', 'surface', 7], ['ink', 'surface-2', 7],
  ['muted', 'bg', 4.5], ['muted', 'surface', 4.5], ['muted', 'surface-2', 4.5],
  ['on-accent', 'accent', 4.5],
  ['accent-text', 'bg', 4.5], ['accent-text', 'surface', 4.5], ['accent-text', 'surface-2', 4.5],
  ['good', 'good-bg', 4.5], ['good', 'surface', 4.5],
  ['bad', 'bad-bg', 4.5], ['bad', 'surface', 4.5], ['bad', 'surface-2', 4.5],
  ['line-strong', 'surface', 3], ['line-strong', 'surface-2', 3],
  ['accent', 'surface', 3], ['base', 'surface', 3],
  ['focus', 'bg', 3], ['focus', 'surface', 3], ['focus', 'surface-2', 3],
  ['surface', 'ink', 7],            // chart tooltip
  ['hero-ink', 'hero-bg', 7],       // "This week" card text
  ['hero-money', 'hero-bg', 3],     // "This week" total, 32 px bold (large text)
];

test('every colour pair meets its WCAG 2.2 contrast in light and dark', () => {
  const fails = [];
  for (const [mode, T] of [['light', LIGHT], ['dark', DARK]]) {
    for (const [fg, bg, min] of PAIRS) {
      assert.ok(T[fg] && T[bg], mode + ': --' + fg + ' and --' + bg + ' are defined');
      const r = ratio(T[fg], T[bg]);
      if (r < min) fails.push(mode + ' --' + fg + ' on --' + bg + ' ' + r.toFixed(2) + ' < ' + min);
    }
  }
  assert.deepEqual(fails, []);
});

test('the two dark blocks are identical and override every light colour', () => {
  assert.deepEqual(colours(MEDIA_BODY), colours(DARK_BODY));
  assert.deepEqual(Object.keys(colours(DARK_BODY)).sort(), Object.keys(LIGHT).sort());
  assert.match(MEDIA_BODY, /color-scheme:\s*dark/);
  assert.match(DARK_BODY, /color-scheme:\s*dark/);
  assert.match(LIGHT_BODY, /color-scheme:\s*light/);
});

test('components use tokens only: no colour literal outside the token blocks', () => {
  const rest = css.replace(LIGHT_BODY, '').replace(MEDIA_BODY, '').replace(DARK_BODY, '');
  const found = [];
  for (const m of rest.matchAll(/\{([^{}]*)\}/g)) {
    for (const decl of m[1].split(';')) {
      if (!decl.includes(':')) continue;
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(decl.slice(decl.indexOf(':') + 1))) found.push(decl.trim());
    }
  }
  assert.deepEqual(found, []);
});

test('the old token names are gone', () => {
  for (const old of ['--paper', '--bonus', '--warn']) {
    assert.ok(!css.includes(old), 'styles.css still uses ' + old);
    assert.ok(!app.includes(old), 'src/app.js still uses ' + old);
    assert.ok(!html.includes(old), 'index.html still uses ' + old);
  }
});

test('the theme-color tags match the --bg of each theme', () => {
  assert.ok(html.includes('<meta name="theme-color" content="' + LIGHT.bg + '" media="(prefers-color-scheme: light)">'), 'light ' + LIGHT.bg);
  assert.ok(html.includes('<meta name="theme-color" content="' + DARK.bg + '" media="(prefers-color-scheme: dark)">'), 'dark ' + DARK.bg);
});

test('the icons are Phosphor Regular originals, with the same ids as before plus i-caret', () => {
  const MAP = { 'i-warn': 'warning', 'i-gear': 'gear-six', 'i-clock': 'clock', 'i-bars': 'chart-bar', 'i-bank': 'bank', 'i-slip': 'receipt', 'i-caret': 'caret-down' };
  const dir = path.join(root, 'node_modules/@phosphor-icons/core/assets/regular');
  for (const [id, name] of Object.entries(MAP)) {
    const sym = new RegExp('<symbol id="' + id + '" viewBox="0 0 256 256"><path fill="currentColor" d="([^"]+)"/></symbol>').exec(html);
    assert.ok(sym, id + ' is in the sprite');
    const src = fs.readFileSync(path.join(dir, name + '.svg'), 'utf8');
    assert.equal(sym[1], /\sd="([^"]+)"/.exec(src)[1], id + ' is Phosphor ' + name);
  }
  assert.ok(fs.existsSync(path.join(root, 'icons/LICENSE-phosphor.txt')), 'Phosphor licence is in icons/');
});
